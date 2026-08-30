import { PrismaClient, CaseStatus, AttemptStatus } from "@prisma/client";

/**
 * Strict Single Financial Evidence Scope Metrics.
 * 
 * INVARIANT:
 * "Verified Test Mode Recovered" includes ONLY cases with CaseStatus.RECOVERED
 * where authoritative captured payment evidence was validated and settled.
 * 
 * Dispatched attempts, awaiting payments, and manual-review cases are strictly
 * operational pipeline indicators and NEVER contribute to recovered financial totals.
 */
export interface FinancialAccountingMetrics {
  // FINANCIAL EVIDENCE SCOPE (Recovered Money Only)
  verifiedRecoveredAmountMinor: bigint;
  verifiedRecoveredCount: number;

  // OPERATIONAL EVIDENCE SCOPE (Operational Activity - Not Recovered Money)
  totalDetectedVolumeMinor: bigint;
  totalDetectedCount: number;
  operationalAttemptsCount: number;
  inProgressCasesCount: number;
  manualReviewCasesCount: number;
  closedOrFailedCasesCount: number;
  verifiedWebhookEventsCount: number;
}

export interface ReconciliationLedgerItem {
  caseId: string;
  originalPaymentId: string;
  orderId: string | null;
  originalAmountMinor: bigint;
  currency: string;
  caseStatus: CaseStatus;
  caseVersion: number;
  detectedAt: Date;
  recoveredAt: Date | null;
  attemptNumber: number | null;
  attemptStatus: AttemptStatus | null;
  providerPaymentLinkId: string | null;
  providerPaymentLinkUrl: string | null;
  providerCapturedPaymentId: string | null;
  correlationToken: string | null;
  verifiedWebhookEventId: string | null;
  verifiedCapturedAmountMinor: bigint | null;
  auditLogCount: number;
  customerEmail: string | null;
}

/**
 * Computes live accounting metrics directly from the immutable database records.
 * Sourced strictly from verified Razorpay Test Mode webhooks.
 */
export async function getAccountingMetrics(
  prisma: PrismaClient
): Promise<FinancialAccountingMetrics> {
  const [
    allCases,
    attemptsCount,
    webhookCount,
  ] = await Promise.all([
    prisma.recoveryCase.findMany({
      select: {
        id: true,
        status: true,
        amountMinor: true,
        currency: true,
        attempts: {
          select: {
            status: true,
            metadata: true,
          },
        },
      },
    }),
    prisma.recoveryAttempt.count(),
    prisma.webhookEvent.count(),
  ]);

  let verifiedRecoveredAmountMinor = 0n;
  let verifiedRecoveredCount = 0;
  let totalDetectedVolumeMinor = 0n;
  let totalDetectedCount = allCases.length;
  let inProgressCasesCount = 0;
  let manualReviewCasesCount = 0;
  let closedOrFailedCasesCount = 0;

  for (const c of allCases) {
    totalDetectedVolumeMinor += c.amountMinor;

    if (c.status === CaseStatus.RECOVERED) {
      // Confirm at least one attempt is PAID with captured metadata
      const hasPaidAttempt = c.attempts.some((a) => a.status === AttemptStatus.PAID);
      if (hasPaidAttempt) {
        verifiedRecoveredAmountMinor += c.amountMinor;
        verifiedRecoveredCount += 1;
      }
    } else if (c.status === CaseStatus.IN_PROGRESS) {
      inProgressCasesCount += 1;
    } else if (c.status === CaseStatus.MANUAL_REVIEW) {
      manualReviewCasesCount += 1;
    } else if (c.status === CaseStatus.FAILED || c.status === CaseStatus.CLOSED || c.status === CaseStatus.EXPIRED) {
      closedOrFailedCasesCount += 1;
    }
  }

  return {
    verifiedRecoveredAmountMinor,
    verifiedRecoveredCount,
    totalDetectedVolumeMinor,
    totalDetectedCount,
    operationalAttemptsCount: attemptsCount,
    inProgressCasesCount,
    manualReviewCasesCount,
    closedOrFailedCasesCount,
    verifiedWebhookEventsCount: webhookCount,
  };
}

/**
 * Returns full end-to-end reconciliation ledger linking:
 * Case -> Attempt -> Provider IDs -> Verified Webhook Event -> Counted Amount -> Audit Records.
 */
export async function getReconciliationLedger(
  prisma: PrismaClient
): Promise<ReconciliationLedgerItem[]> {
  const cases = await prisma.recoveryCase.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      attempts: {
        orderBy: { attemptNumber: "desc" },
      },
      auditLogs: {
        select: { id: true },
      },
    },
  });

  return cases.map((c) => {
    const latestAttempt = c.attempts[0];
    const paidAttempt = c.attempts.find((a) => a.status === AttemptStatus.PAID) || latestAttempt;
    const meta = (paidAttempt?.metadata || {}) as Record<string, unknown>;

    const capturedPaymentId = typeof meta["capturedPaymentId"] === "string" ? meta["capturedPaymentId"] : null;
    const correlationToken = typeof meta["correlationToken"] === "string" ? meta["correlationToken"] : null;
    const webhookEventId = typeof meta["webhookEventId"] === "string" ? meta["webhookEventId"] : null;
    const capturedAmountStr = typeof meta["capturedAmountMinor"] === "string" ? meta["capturedAmountMinor"] : null;
    const verifiedCapturedAmountMinor = capturedAmountStr ? BigInt(capturedAmountStr) : (c.status === CaseStatus.RECOVERED ? c.amountMinor : null);

    return {
      caseId: c.id,
      originalPaymentId: c.paymentId,
      orderId: c.orderId,
      originalAmountMinor: c.amountMinor,
      currency: c.currency,
      caseStatus: c.status,
      caseVersion: c.version,
      detectedAt: c.createdAt,
      recoveredAt: c.recoveredAt,
      attemptNumber: paidAttempt ? paidAttempt.attemptNumber : null,
      attemptStatus: paidAttempt ? paidAttempt.status : null,
      providerPaymentLinkId: paidAttempt?.paymentLinkId || null,
      providerPaymentLinkUrl: paidAttempt?.paymentLinkUrl || null,
      providerCapturedPaymentId: capturedPaymentId,
      correlationToken,
      verifiedWebhookEventId: webhookEventId,
      verifiedCapturedAmountMinor,
      auditLogCount: c.auditLogs.length,
      customerEmail: c.customerEmail,
    };
  });
}
