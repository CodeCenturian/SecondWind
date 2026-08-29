import { PrismaClient, Prisma, CaseStatus, WebhookStatus, AuditActorType, RecoveryCase } from "@prisma/client";
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
