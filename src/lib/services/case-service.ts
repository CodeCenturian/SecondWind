import {
  PrismaClient,
  Prisma,
  CaseStatus,
  AttemptStatus,
  WebhookStatus,
  AuditActorType,
  RecoveryCase,
  RecoveryAttempt,
} from "@prisma/client";
import { ConcurrencyConflictError } from "../errors";
import { PaymentEntity, sanitizePayload } from "../webhook";
import { formatAuditEntry } from "../audit";

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
            formatAuditEntry({
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
            }),
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
  providerPaymentId: string; // Razorpay payment ID: pay_xxx
  amountMinor: bigint; // captured amount in minor units
  currency: string; // e.g. "INR"
  status: string; // e.g. "captured" or "paid"
  captured: boolean; // Must be true for final recovery settlement
  webhookEventId?: string;
  rawPayload?: Record<string, unknown>;
}

export interface ReconcilePaymentResult {
  matched: boolean;
  isDuplicate: boolean;
  transitionedToRecovered: boolean;
  caseRecord?: RecoveryCase;
  attemptRecord?: RecoveryAttempt;
  status: "RECOVERED" | "MANUAL_REVIEW" | "ALREADY_RECOVERED" | "NO_MATCH" | "NON_CAPTURED_IGNORED";
  reason: string;
}

/**
 * Authoritatively reconciles an incoming payment event against active recovery cases and attempts.
 * Transitions to RECOVERED ONLY when:
 * 1. An exact matching RecoveryAttempt / RecoveryCase is found by paymentLinkId or opaque correlationToken.
 * 2. Provider confirms captured: true and status: "captured" | "paid".
 * 3. Exact amount and currency constraints match the case specification.
 * Mismatches or non-captured statuses fail closed to MANUAL_REVIEW or are recorded without double-counting.
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

  // 1. Locate RecoveryAttempt by paymentLinkId or correlationToken
  let matchedAttempt = null;

  if (providerPaymentLinkId) {
    matchedAttempt = await prisma.recoveryAttempt.findFirst({
      where: { paymentLinkId: providerPaymentLinkId },
      include: { recoveryCase: true },
    });
  }

  if (!matchedAttempt && correlationToken) {
    // Look up attempt by correlation token in metadata or paymentLinkId
    const attempts = await prisma.recoveryAttempt.findMany({
      where: {
        metadata: {
          path: ["correlationToken"],
          equals: correlationToken,
        },
      },
      include: { recoveryCase: true },
      take: 1,
    });
    if (attempts.length > 0) {
      matchedAttempt = attempts[0];
    }
  }

  if (!matchedAttempt && caseId) {
    const directCase = await prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
          take: 1,
        },
      },
    });
    if (directCase && directCase.attempts.length > 0) {
      const latestAttempt = directCase.attempts[0];
      if (latestAttempt) {
        matchedAttempt = {
          ...latestAttempt,
          recoveryCase: directCase,
        };
      }
    }
  }

  if (!matchedAttempt || !matchedAttempt.recoveryCase) {
    return {
      matched: false,
      isDuplicate: false,
      transitionedToRecovered: false,
      status: "NO_MATCH",
      reason: `No matching recovery attempt or case found for provider payment link "${providerPaymentLinkId}" / correlation "${correlationToken}"`,
    };
  }

  const currentCase = matchedAttempt.recoveryCase;
  const currentAttempt = matchedAttempt;

  // 2. Check for Duplicate / Idempotent Webhook
  if (currentCase.status === CaseStatus.RECOVERED) {
    return {
      matched: true,
      isDuplicate: true,
      transitionedToRecovered: false,
      caseRecord: currentCase,
      attemptRecord: currentAttempt,
      status: "ALREADY_RECOVERED",
      reason: `Case ${currentCase.id} is already in RECOVERED state. Duplicate webhook acknowledged idempotently.`,
    };
  }

  // 3. Check Authoritative Captured Status
  // INVARIANT: Only payments with captured === true count as recovered money!
  const isCaptured = captured === true && (paymentStatus.toLowerCase() === "captured" || paymentStatus.toLowerCase() === "paid");
  if (!isCaptured) {
    // Record audit observation but do NOT transition to RECOVERED
    await prisma.caseAuditLog.create({
      data: {
        caseId: currentCase.id,
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
      caseRecord: currentCase,
      attemptRecord: currentAttempt,
      status: "NON_CAPTURED_IGNORED",
      reason: `Payment status "${paymentStatus}" with captured=${captured} is not authoritative captured settlement. Operational count only.`,
    };
  }

  // 4. Amount and Currency Validation
  const currencyMatches = currency.toUpperCase() === currentCase.currency.toUpperCase();
  const amountSufficient = amountMinor >= currentCase.amountMinor;

  if (!currencyMatches || !amountSufficient) {
    // Mismatch fails closed to MANUAL_REVIEW
    const updatedCase = await prisma.$transaction(async (tx) => {
      const c = await tx.recoveryCase.update({
        where: { id: currentCase.id },
        data: {
          status: CaseStatus.MANUAL_REVIEW,
          version: currentCase.version + 1,
        },
      });

      await tx.recoveryAttempt.update({
        where: { id: currentAttempt.id },
        data: {
          status: AttemptStatus.FAILED,
          errorMessage: `Amount/Currency mismatch: expected ${currentCase.amountMinor} ${currentCase.currency}, received ${amountMinor} ${currency}`,
        },
      });

      await tx.caseAuditLog.create({
        data: {
          caseId: currentCase.id,
          action: "RECOVERY_AMOUNT_MISMATCH_ROUTED_TO_MANUAL_REVIEW",
          actorType: AuditActorType.SYSTEM,
          previousState: { status: currentCase.status, version: currentCase.version },
          newState: { status: CaseStatus.MANUAL_REVIEW, version: c.version },
          reason: `Captured amount (${amountMinor} ${currency}) mismatched expected case amount (${currentCase.amountMinor} ${currentCase.currency}).`,
          metadata: {
            providerPaymentId,
            providerPaymentLinkId,
            webhookEventId,
            expectedAmount: currentCase.amountMinor.toString(),
            receivedAmount: amountMinor.toString(),
            expectedCurrency: currentCase.currency,
            receivedCurrency: currency,
          },
        },
      });

      return c;
    });

    return {
      matched: true,
      isDuplicate: false,
      transitionedToRecovered: false,
      caseRecord: updatedCase,
      attemptRecord: currentAttempt,
      status: "MANUAL_REVIEW",
      reason: `Amount/Currency mismatch: expected ${currentCase.amountMinor} ${currentCase.currency}, received ${amountMinor} ${currency}. Case routed to MANUAL_REVIEW.`,
    };
  }

  // 5. Atomic Settlement Commit
  const settlementResult = await prisma.$transaction(async (tx) => {
    // Update RecoveryAttempt to PAID
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

    // Update RecoveryCase to RECOVERED
    const updatedCase = await tx.recoveryCase.update({
      where: { id: currentCase.id },
      data: {
        status: CaseStatus.RECOVERED,
        recoveredAt: new Date(),
        version: currentCase.version + 1,
      },
    });

    // Create immutable audit log
    await tx.caseAuditLog.create({
      data: {
        caseId: currentCase.id,
        action: "RECOVERY_VERIFIED_AND_SETTLED",
        actorType: AuditActorType.SYSTEM,
        actorId: "razorpay_webhook_settlement",
        previousState: {
          status: currentCase.status,
          version: currentCase.version,
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

