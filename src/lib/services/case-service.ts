import {
  PrismaClient,
  Prisma,
  CaseStatus,
  AttemptStatus,
  WebhookStatus,
  AuditActorType,
  RecoveryCase,
  RecoveryAttempt,
  RefundStatus,
  RefundTask,
} from "@prisma/client";
import { ConcurrencyConflictError } from "../errors";
import { PaymentEntity, sanitizePayload } from "../webhook";
import { formatAuditEntry, safeJson } from "../audit";
import { ProviderAdapter, RazorpayAdapter } from "../adapters/provider-adapter";
import { evaluateCorrelation } from "./correlation-service";

export interface ClaimEventInput {
  eventId: string;
  eventType: string;
  rawPayload: unknown;
  signature: string;
}

export interface ClaimEventResult {
  isDuplicate: boolean;
  event: {
    id: string;
    eventId: string;
    status: WebhookStatus;
  };
}

/**
 * Idempotently claims an incoming webhook event.
 * If event has already been recorded, returns isDuplicate: true without throwing.
 */
export async function claimWebhookEvent(
  prisma: PrismaClient,
  input: ClaimEventInput
): Promise<ClaimEventResult> {
  const sanitized = sanitizePayload(input.rawPayload);

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        eventId: input.eventId,
        eventType: input.eventType,
        payload: JSON.parse(JSON.stringify(sanitized)) as Prisma.InputJsonValue,
        signature: input.signature,
        status: WebhookStatus.RECEIVED,
      },
      select: {
        id: true,
        eventId: true,
        status: true,
      },
    });

    return { isDuplicate: false, event: created };
  } catch (error: unknown) {
    // Check for Prisma unique constraint violation (P2002 on eventId)
    const isP2002 =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002";

    if (isP2002) {
      const existing = await prisma.webhookEvent.findUnique({
        where: { eventId: input.eventId },
        select: { id: true, eventId: true, status: true },
      });

      if (existing) {
        return { isDuplicate: true, event: existing };
      }
    }

    throw error;
  }
}

/**
 * Ensures a merchant policy exists for the merchant account ID before attaching cases.
 */
export async function ensureMerchantPolicy(
  prisma: PrismaClient,
  merchantId: string
) {
  const existing = await prisma.merchantPolicy.findUnique({
    where: { merchantId },
  });

  if (existing) {
    return existing;
  }

  return prisma.merchantPolicy.create({
    data: {
      merchantId,
      maxAttempts: 3,
      coolingPeriodMinutes: 30,
      linkExpiryMinutes: 1440,
    },
  });
}

export interface IngestPaymentFailureInput {
  merchantId: string;
  payment: PaymentEntity;
  webhookEventId?: string;
}

/**
 * Ingests a documented payment.failed event and deterministically creates/updates a RecoveryCase in DETECTED state.
 * Never takes automated recovery action.
 */
export async function ingestPaymentFailure(
  prisma: PrismaClient,
  input: IngestPaymentFailureInput
): Promise<{ case: RecoveryCase; isNew: boolean }> {
  const { merchantId, payment, webhookEventId } = input;

  await ensureMerchantPolicy(prisma, merchantId);

  const amountMinor = BigInt(payment.amount);
  const failureReason =
    payment.error_description ||
    payment.error_reason ||
    payment.error_code ||
    "Payment failure detected";

  // Check if case already exists for (merchantId, paymentId)
  const existing = await prisma.recoveryCase.findUnique({
    where: {
      merchantId_paymentId: {
        merchantId,
        paymentId: payment.id,
      },
    },
  });

  if (!existing) {
    // Create new RecoveryCase in state DETECTED with version 1
    const newCase = await prisma.recoveryCase.create({
      data: {
        merchantId,
        paymentId: payment.id,
        orderId: payment.order_id ?? null,
        customerEmail: payment.email ?? null,
        customerPhone: payment.contact ?? null,
        amountMinor,
        currency: payment.currency || "INR",
        status: CaseStatus.DETECTED,
        failureCode: payment.error_code ?? null,
        failureReason,
        version: 1,
        auditLogs: {
          create: [
            (() => {
              const { caseId: _omitted, ...auditData } = formatAuditEntry({
                caseId: "", // Prisma handles relation
                action: "CASE_DETECTED",
                actorType: AuditActorType.SYSTEM,
                newState: {
                  status: CaseStatus.DETECTED,
                  amountMinor: payment.amount,
                  currency: payment.currency,
                  failureCode: payment.error_code,
                  failureReason,
                },
                reason: `Failure detected via provider webhook ${webhookEventId ?? ""}`.trim(),
                metadata: {
                  paymentId: payment.id,
                  orderId: payment.order_id,
                  webhookEventId,
                },
              });
              return auditData;
            })(),
          ],
        },
      },
      include: {
        auditLogs: true,
      },
    });

    return { case: newCase, isNew: true };
  }

  // If case exists, apply deterministic idempotency update under optimistic concurrency
  const updated = await updateCaseWithOptimisticLock(prisma, {
    caseId: existing.id,
    expectedVersion: existing.version,
    updateData: {
      failureCode: payment.error_code ?? existing.failureCode,
      failureReason: failureReason ?? existing.failureReason,
      // If still DETECTED or OPEN, keep state stable
      status: existing.status,
    },
    auditAction: "PAYMENT_FAILURE_RE_EMITTED",
    reason: `Duplicate failure notification received for payment ${payment.id}`,
    metadata: { webhookEventId, paymentId: payment.id },
  });

  return { case: updated, isNew: false };
}

export interface OptimisticUpdateInput {
  caseId: string;
  expectedVersion: number;
  updateData: Partial<{
    status: CaseStatus;
    failureCode: string | null;
    failureReason: string | null;
    strategy: string | null;
    recoveredAt: Date | null;
    lastAttemptAt: Date | null;
  }>;
  auditAction: string;
  actorType?: AuditActorType;
  actorId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Updates a RecoveryCase enforcing strict optimistic concurrency on `version`.
 * Throws ConcurrencyConflictError if expectedVersion does not match current state.
 */
export async function updateCaseWithOptimisticLock(
  prisma: PrismaClient,
  input: OptimisticUpdateInput,
  maxRetries: number = 2
): Promise<RecoveryCase> {
  let attempt = 0;

  while (attempt <= maxRetries) {
    const current = await prisma.recoveryCase.findUnique({
      where: { id: input.caseId },
    });

    if (!current) {
      throw new Error(`RecoveryCase with ID ${input.caseId} not found.`);
    }

    if (current.version !== input.expectedVersion && attempt === 0) {
      throw new ConcurrencyConflictError(
        input.caseId,
        input.expectedVersion,
        current.version
      );
    }

    // Atomic update matching where: { id, version: current.version }
    const updatedCount = await prisma.recoveryCase.updateMany({
      where: {
        id: input.caseId,
        version: current.version,
      },
      data: {
        ...input.updateData,
        version: current.version + 1,
      },
    });

    if (updatedCount.count > 0) {
      const updatedCase = await prisma.recoveryCase.findUniqueOrThrow({
        where: { id: input.caseId },
      });

      // Write immutable audit log entry
      await prisma.caseAuditLog.create({
        data: {
          caseId: input.caseId,
          action: input.auditAction,
          actorType: input.actorType ?? AuditActorType.SYSTEM,
          actorId: input.actorId ?? null,
          previousState: {
            status: current.status,
            version: current.version,
          },
          newState: {
            status: updatedCase.status,
            version: updatedCase.version,
            ...input.updateData,
          },
          reason: input.reason ?? null,
          metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : null,
        },
      });

      return updatedCase;
    }

    attempt++;
  }

  throw new ConcurrencyConflictError(
    input.caseId,
    input.expectedVersion,
    -1
  );
}

/**
 * Safely marks a WebhookEvent as PROCESSED or IGNORED without crashing.
 */
export async function updateWebhookEventStatus(
  prisma: PrismaClient,
  eventId: string,
  status: WebhookStatus,
  error?: string | null
) {
  return prisma.webhookEvent.update({
    where: { eventId },
    data: {
      status,
      error: error ?? null,
      processedAt: new Date(),
    },
  });
}

export interface ReconcilePaymentInput {
  merchantId?: string;
  providerPaymentLinkId?: string | null;
  correlationToken?: string | null;
  caseId?: string | null;
  orderId?: string | null;
  providerPaymentId: string; // Razorpay payment ID: pay_xxx
  amountMinor: bigint; // captured amount in minor units
  currency: string; // e.g. "INR"
  status: string; // e.g. "captured" or "paid"
  captured: boolean; // Must be true for final recovery settlement
  webhookEventId?: string;
  rawPayload?: Record<string, unknown>;
  adapter?: ProviderAdapter;
}

export interface ReconcilePaymentResult {
  matched: boolean;
  isDuplicate: boolean;
  transitionedToRecovered: boolean;
  caseRecord?: RecoveryCase;
  attemptRecord?: RecoveryAttempt;
  status: "RECOVERED" | "MANUAL_REVIEW" | "ALREADY_RECOVERED" | "NO_MATCH" | "NON_CAPTURED_IGNORED" | "DUPLICATE_RISK_FLAGGED";
  reason: string;
  refundTask?: RefundTask;
}

/**
 * Authoritatively reconciles an incoming payment event against active recovery cases and attempts.
 * Transitions to RECOVERED ONLY when:
 * 1. An exact matching RecoveryAttempt / RecoveryCase is found by paymentLinkId or opaque correlationToken.
 * 2. Provider confirms captured: true and status: "captured" | "paid".
 * 3. Exact amount and currency constraints match the case specification.
 * Mismatches, non-captured statuses, or late adversarial races fail closed to MANUAL_REVIEW or trigger remediation.
 */
export async function reconcileRecoveryPayment(
  prisma: PrismaClient,
  input: ReconcilePaymentInput
): Promise<ReconcilePaymentResult> {
  const {
    providerPaymentLinkId,
    correlationToken,
    caseId,
    providerPaymentId,
    amountMinor,
    currency,
    status: paymentStatus,
    captured,
    webhookEventId,
  } = input;

  const activeAdapter: ProviderAdapter = input.adapter || new RazorpayAdapter();

  // 1. Locate RecoveryAttempt and candidate RecoveryCase
  let matchedCase: (RecoveryCase & {
    attempts: RecoveryAttempt[];
    merchantPolicy?: import("@prisma/client").MerchantPolicy | null;
    refundTasks?: RefundTask[];
  }) | null = null;
  let matchedAttempt: RecoveryAttempt | null = null;

  if (providerPaymentLinkId) {
    const att = await prisma.recoveryAttempt.findFirst({
      where: { paymentLinkId: providerPaymentLinkId },
      include: {
        recoveryCase: {
          include: {
            attempts: { orderBy: { attemptNumber: "asc" } },
            merchantPolicy: true,
            refundTasks: true,
          },
        },
      },
    });
    if (att) {
      matchedAttempt = att;
      matchedCase = att.recoveryCase as any;
    }
  }

  if (!matchedCase && correlationToken) {
    const attempts = await prisma.recoveryAttempt.findMany({
      where: {
        metadata: {
          path: ["correlationToken"],
          equals: correlationToken,
        },
      },
      include: {
        recoveryCase: {
          include: {
            attempts: { orderBy: { attemptNumber: "asc" } },
            merchantPolicy: true,
            refundTasks: true,
          },
        },
      },
      take: 1,
    });
    if (attempts.length > 0) {
      matchedAttempt = attempts[0] || null;
      matchedCase = attempts[0]?.recoveryCase as any;
    }
  }

  if (!matchedCase && caseId) {
    matchedCase = (await prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        attempts: { orderBy: { attemptNumber: "asc" } },
        merchantPolicy: true,
        refundTasks: true,
      },
    })) as any;
    if (matchedCase && matchedCase.attempts.length > 0) {
      matchedAttempt = matchedCase.attempts[matchedCase.attempts.length - 1] || null;
    }
  }

  if (!matchedCase && providerPaymentId) {
    // Check if this incoming payment matches an original failed case paymentId
    const directCase = await prisma.recoveryCase.findFirst({
      where: { paymentId: providerPaymentId },
      include: {
        attempts: { orderBy: { attemptNumber: "asc" } },
        merchantPolicy: true,
        refundTasks: true,
      },
    });
    if (directCase) {
      matchedCase = directCase as any;
      matchedAttempt = directCase.attempts[directCase.attempts.length - 1] || null;
    }
  }

  if (!matchedCase) {
    return {
      matched: false,
      isDuplicate: false,
      transitionedToRecovered: false,
      status: "NO_MATCH",
      reason: `No matching recovery attempt or case found for provider payment link "${providerPaymentLinkId}" / payment ID "${providerPaymentId}"`,
    };
  }

  // Ensure attempts are loaded on matchedCase
  if (!matchedCase.attempts || matchedCase.attempts.length === 0) {
    const loadedAttempts = await prisma.recoveryAttempt.findMany({
      where: { caseId: matchedCase.id },
      orderBy: { attemptNumber: "asc" },
    });
    matchedCase.attempts = loadedAttempts || [];
  }

  // 2. Pure Correlation Evaluation
  const candidateSummary = {
    id: matchedCase.id,
    paymentId: matchedCase.paymentId,
    orderId: matchedCase.orderId,
    customerEmail: matchedCase.customerEmail,
    amountMinor: matchedCase.amountMinor,
    currency: matchedCase.currency,
    status: matchedCase.status,
    recoveredAt: matchedCase.recoveredAt,
    attempts: (matchedCase.attempts || []).map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      status: a.status,
      paymentLinkId: a.paymentLinkId,
      metadata: (a.metadata as Record<string, unknown>) || null,
    })),
  };

  const decision = evaluateCorrelation(
    {
      paymentId: providerPaymentId,
      amountMinor,
      currency,
      status: paymentStatus,
      captured,
      orderId: input.orderId || matchedCase.orderId,
      paymentLinkId: providerPaymentLinkId,
      correlationToken,
      notes: (input.rawPayload?.["payload"] as any)?.payment?.entity?.notes || {},
    },
    candidateSummary
  );

  // 3. Handle CONFIRMED_DUPLICATE_RACE (Adversarial Payment Race Protection)
  if (decision.classification === "CONFIRMED_DUPLICATE_RACE") {
    const idempotencyKey = `rfnd_idem_${matchedCase.id}_${providerPaymentId}`;

    // Check if duplicate race was already remediated
    const existingRefundTask = await prisma.refundTask.findUnique({
      where: { idempotencyKey },
    });

    if (existingRefundTask) {
      return {
        matched: true,
        isDuplicate: true,
        transitionedToRecovered: false,
        caseRecord: matchedCase,
        status: "DUPLICATE_RISK_FLAGGED",
        reason: "Adversarial duplicate race was already recorded and remediated.",
        refundTask: existingRefundTask,
      };
    }

    // A. Flag Duplicate Risk on Case Atomically
    const updatedCase = await prisma.$transaction(async (tx) => {
      const c = await tx.recoveryCase.update({
        where: { id: matchedCase.id },
        data: {
          status: CaseStatus.MANUAL_REVIEW,
          version: matchedCase.version + 1,
        },
      });

      await tx.caseAuditLog.create({
        data: {
          caseId: matchedCase.id,
          action: "ADVERSARIAL_PAYMENT_RACE_DETECTED",
          actorType: AuditActorType.SYSTEM,
          previousState: safeJson({ status: matchedCase.status, version: matchedCase.version }),
          newState: safeJson({ status: CaseStatus.MANUAL_REVIEW, version: c.version }),
          reason: "Late original payment event arrived on already recovered case. Duplicate risk flagged.",
          metadata: safeJson({
            originalPaymentId: decision.originalPaymentId,
            conflictingPaymentId: decision.conflictingPaymentId,
            evidence: decision.evidence,
            webhookEventId,
          }),
        },
      });

      return c;
    });

    // B. Cancel any pending payment links OUT-OF-TRANSACTION
    const pendingAttempt = matchedCase.attempts.find(
      (a) => (a.status === AttemptStatus.SENT || a.status === AttemptStatus.PENDING) && a.paymentLinkId
    );
    if (pendingAttempt && pendingAttempt.paymentLinkId) {
      const cancelRes = await activeAdapter.cancelPaymentLink(pendingAttempt.paymentLinkId);
      await prisma.caseAuditLog.create({
        data: {
          caseId: matchedCase.id,
          action: "PROVIDER_LINK_CANCELLED",
          actorType: AuditActorType.SYSTEM,
          reason: `Pending payment link cancelled due to duplicate race: ${cancelRes.status}`,
          metadata: safeJson({ paymentLinkId: pendingAttempt.paymentLinkId, cancelRes }),
        },
      });
    }

    // C. Evaluate MerchantPolicy Auto-Refund OUT-OF-TRANSACTION
    const policy = matchedCase.merchantPolicy;
    const isAutoRefundAllowed =
      policy?.autoRefundEnabled === true &&
      (policy.autoRefundThresholdMinor === 0n || amountMinor <= policy.autoRefundThresholdMinor);

    let createdRefundTask: RefundTask;

    if (isAutoRefundAllowed) {
      // Attempt out-of-transaction refund
      const refundResult = await activeAdapter.createRefund({
        paymentId: providerPaymentId,
        amountMinor,
        idempotencyKey,
        speed: "normal",
        notes: {
          case_id: matchedCase.id,
          reason: "adversarial_duplicate_race",
        },
      });

      if (refundResult.success) {
        createdRefundTask = await prisma.refundTask.create({
          data: {
            caseId: matchedCase.id,
            paymentId: providerPaymentId,
            amountMinor,
            currency,
            refundId: refundResult.refundId,
            status: RefundStatus.PROCESSED,
            idempotencyKey,
            metadata: safeJson({
              providerResponse: refundResult.rawResponse,
              webhookEventId,
            }),
          },
        });

        await prisma.caseAuditLog.create({
          data: {
            caseId: matchedCase.id,
            action: "AUTO_REFUND_EXECUTED",
            actorType: AuditActorType.SYSTEM,
            reason: `Auto-refund executed via provider adapter: refund ID ${refundResult.refundId}`,
            metadata: safeJson({ refundId: refundResult.refundId, idempotencyKey }),
          },
        });
      } else {
        // Provider call failed: never assume success, record failure in MANUAL_REVIEW
        createdRefundTask = await prisma.refundTask.create({
          data: {
            caseId: matchedCase.id,
            paymentId: providerPaymentId,
            amountMinor,
            currency,
            status: RefundStatus.MANUAL_REVIEW,
            failureReason: refundResult.error || "Provider refund call failed",
            idempotencyKey,
            metadata: safeJson({
              error: refundResult.error,
              webhookEventId,
            }),
          },
        });

        await prisma.caseAuditLog.create({
          data: {
            caseId: matchedCase.id,
            action: "AUTO_REFUND_FAILED_ROUTED_TO_MANUAL_REVIEW",
            actorType: AuditActorType.SYSTEM,
            reason: refundResult.error || "Provider refund call failed; routed to operator queue.",
            metadata: safeJson({ error: refundResult.error, idempotencyKey }),
          },
        });
      }
    } else {
      // Auto-refund disabled or exceeded threshold: Queue for manual operator resolution
      createdRefundTask = await prisma.refundTask.create({
        data: {
          caseId: matchedCase.id,
          paymentId: providerPaymentId,
          amountMinor,
          currency,
          status: RefundStatus.MANUAL_REVIEW,
          failureReason: "Auto-refund disabled by merchant policy; manual operator review required.",
          idempotencyKey,
          metadata: safeJson({
            policySettings: {
              autoRefundEnabled: policy?.autoRefundEnabled ?? false,
              threshold: policy?.autoRefundThresholdMinor?.toString() ?? "0",
            },
            webhookEventId,
          }),
        },
      });

      await prisma.caseAuditLog.create({
        data: {
          caseId: matchedCase.id,
          action: "REFUND_QUEUED_FOR_MANUAL_REVIEW",
          actorType: AuditActorType.SYSTEM,
          reason: "Auto-refund is disabled by merchant policy; queued for operator resolution.",
          metadata: safeJson({ idempotencyKey }),
        },
      });
    }

    return {
      matched: true,
      isDuplicate: false,
      transitionedToRecovered: false,
      caseRecord: updatedCase,
      status: "DUPLICATE_RISK_FLAGGED",
      reason: "Adversarial duplicate race detected and remediated via policy.",
      refundTask: createdRefundTask,
    };
  }

  // 4. Handle IDEMPOTENT_REPLAY
  if (decision.classification === "IDEMPOTENT_REPLAY") {
    return {
      matched: true,
      isDuplicate: true,
      transitionedToRecovered: false,
      caseRecord: matchedCase,
      attemptRecord: matchedAttempt || undefined,
      status: "ALREADY_RECOVERED",
      reason: `Case ${matchedCase.id} is already in RECOVERED state. Duplicate webhook acknowledged idempotently.`,
    };
  }

  // 5. Handle Non-Captured Status Check
  const isCaptured = captured === true && (paymentStatus.toLowerCase() === "captured" || paymentStatus.toLowerCase() === "paid");
  if (!isCaptured) {
    await prisma.caseAuditLog.create({
      data: {
        caseId: matchedCase.id,
        action: "RECOVERY_PAYMENT_NON_CAPTURED_EVENT",
        actorType: AuditActorType.SYSTEM,
        reason: `Provider webhook received status "${paymentStatus}" (captured: ${captured}); awaiting capture confirmation.`,
        metadata: {
          providerPaymentId,
          providerPaymentLinkId,
          webhookEventId,
          paymentStatus,
          captured,
        },
      },
    });

    return {
      matched: true,
      isDuplicate: false,
      transitionedToRecovered: false,
      caseRecord: matchedCase,
      attemptRecord: matchedAttempt || undefined,
      status: "NON_CAPTURED_IGNORED",
      reason: `Payment status "${paymentStatus}" with captured=${captured} is not authoritative captured settlement. Operational count only.`,
    };
  }

  // 6. Handle AMOUNT_MISMATCH or POSSIBLE_DUPLICATE
  if (decision.classification === "AMOUNT_MISMATCH" || decision.classification === "POSSIBLE_DUPLICATE") {
    const updatedCase = await prisma.$transaction(async (tx) => {
      const c = await tx.recoveryCase.update({
        where: { id: matchedCase.id },
        data: {
          status: CaseStatus.MANUAL_REVIEW,
          version: matchedCase.version + 1,
        },
      });

      if (matchedAttempt) {
        await tx.recoveryAttempt.update({
          where: { id: matchedAttempt.id },
          data: {
            status: AttemptStatus.FAILED,
            errorMessage: `Amount/Currency mismatch: expected ${matchedCase.amountMinor} ${matchedCase.currency}, received ${amountMinor} ${currency}`,
          },
        });
      }

      await tx.caseAuditLog.create({
        data: {
          caseId: matchedCase.id,
          action: "RECOVERY_AMOUNT_MISMATCH_ROUTED_TO_MANUAL_REVIEW",
          actorType: AuditActorType.SYSTEM,
          previousState: { status: matchedCase.status, version: matchedCase.version },
          newState: { status: CaseStatus.MANUAL_REVIEW, version: c.version },
          reason: `Captured payment (${amountMinor} ${currency}) mismatched expected case specifications.`,
          metadata: safeJson({
            providerPaymentId,
            providerPaymentLinkId,
            webhookEventId,
            decision,
          }),
        },
      });

      return c;
    });

    return {
      matched: true,
      isDuplicate: false,
      transitionedToRecovered: false,
      caseRecord: updatedCase,
      attemptRecord: matchedAttempt || undefined,
      status: "MANUAL_REVIEW",
      reason: `Classification ${decision.classification}: routed to MANUAL_REVIEW.`,
    };
  }

  // 7. Atomic Settlement Commit for MATCHED_RECOVERY_ATTEMPT
  if (!matchedAttempt) {
    return {
      matched: false,
      isDuplicate: false,
      transitionedToRecovered: false,
      status: "NO_MATCH",
      reason: "No matched attempt found for final settlement.",
    };
  }

  const currentAttempt = matchedAttempt;
  const settlementResult = await prisma.$transaction(async (tx) => {
    const existingMeta = (currentAttempt.metadata || {}) as Record<string, unknown>;
    const updatedAttempt = await tx.recoveryAttempt.update({
      where: { id: currentAttempt.id },
      data: {
        status: AttemptStatus.PAID,
        metadata: {
          ...existingMeta,
          capturedPaymentId: providerPaymentId,
          capturedAmountMinor: amountMinor.toString(),
          capturedCurrency: currency,
          capturedAt: new Date().toISOString(),
          webhookEventId,
        },
      },
    });

    const updatedCase = await tx.recoveryCase.update({
      where: { id: matchedCase.id },
      data: {
        status: CaseStatus.RECOVERED,
        recoveredAt: new Date(),
        version: matchedCase.version + 1,
      },
    });

    await tx.caseAuditLog.create({
      data: {
        caseId: matchedCase.id,
        action: "RECOVERY_VERIFIED_AND_SETTLED",
        actorType: AuditActorType.SYSTEM,
        actorId: "razorpay_webhook_settlement",
        previousState: {
          status: matchedCase.status,
          version: matchedCase.version,
        },
        newState: {
          status: CaseStatus.RECOVERED,
          version: updatedCase.version,
          paymentId: providerPaymentId,
          amountMinor: amountMinor.toString(),
          currency,
          attemptId: currentAttempt.id,
        },
        reason: `Recovery payment ${providerPaymentId} confirmed captured with exact amount ${amountMinor} ${currency}.`,
        metadata: {
          providerPaymentId,
          providerPaymentLinkId,
          correlationToken,
          webhookEventId,
          settledAt: new Date().toISOString(),
        },
      },
    });

    return { updatedCase, updatedAttempt };
  });

  return {
    matched: true,
    isDuplicate: false,
    transitionedToRecovered: true,
    caseRecord: settlementResult.updatedCase,
    attemptRecord: settlementResult.updatedAttempt,
    status: "RECOVERED",
    reason: `Recovery payment ${providerPaymentId} verified and settled. Case transitioned to RECOVERED.`,
  };
}


