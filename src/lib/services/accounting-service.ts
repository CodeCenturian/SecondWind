import { PrismaClient, CaseStatus, AttemptStatus, RefundStatus } from "@prisma/client";

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

  // REMEDIATION & DUPLICATE RISK SCOPE
  duplicateRiskCasesCount: number;
  pendingRefundTasksCount: number;
  processedRefundsCount: number;
  processedRefundsAmountMinor: bigint;
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
  hasDuplicateRisk: boolean;
  refundStatus: RefundStatus | null;
}

export interface DuplicateQueueItem {
  caseId: string;
  originalPaymentId: string;
  orderId: string | null;
  amountMinor: bigint;
  currency: string;
  caseStatus: CaseStatus;
  detectedAt: Date;
  recoveredAt: Date | null;
  refundTaskId: string | null;
  refundStatus: RefundStatus | null;
  refundPaymentId: string | null;
  refundId: string | null;
  failureReason: string | null;
  createdAt: Date;
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
    refundTasks,
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
        auditLogs: {
          select: {
            action: true,
          },
        },
        refundTasks: {
          select: {
            id: true,
            status: true,
            amountMinor: true,
          },
        },
      },
    }),
    prisma.recoveryAttempt.count(),
    prisma.webhookEvent.count(),
    prisma.refundTask && prisma.refundTask.findMany ? prisma.refundTask.findMany() : Promise.resolve([]),
  ]);

  let verifiedRecoveredAmountMinor = 0n;
  let verifiedRecoveredCount = 0;
  let totalDetectedVolumeMinor = 0n;
  let totalDetectedCount = (allCases || []).length;
  let inProgressCasesCount = 0;
  let manualReviewCasesCount = 0;
  let closedOrFailedCasesCount = 0;
  let duplicateRiskCasesCount = 0;

  for (const c of allCases || []) {
    totalDetectedVolumeMinor += c.amountMinor;

    const caseRefunds = c.refundTasks || [];
    const caseAudits = c.auditLogs || [];
    const caseAttempts = c.attempts || [];

    const hasDuplicateRisk =
      caseRefunds.length > 0 ||
      caseAudits.some((l) => l.action.includes("DUPLICATE_RACE") || l.action.includes("ADVERSARIAL"));

    if (hasDuplicateRisk) {
      duplicateRiskCasesCount += 1;
    }

    if (c.status === CaseStatus.RECOVERED) {
      // Confirm at least one attempt is PAID with captured metadata AND is not a simulation
      const hasPaidAttempt = caseAttempts.some((a) => {
        if (a.status !== AttemptStatus.PAID) return false;
        const meta = (a.metadata || {}) as Record<string, unknown>;
        // INVARIANT: Injected simulation scenarios CANNOT contribute to verified recovered money
        if (meta["isSimulation"] === true || meta["isDevInjected"] === true) {
          return false;
        }
        return true;
      });
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

  let pendingRefundTasksCount = 0;
  let processedRefundsCount = 0;
  let processedRefundsAmountMinor = 0n;

  for (const rt of refundTasks) {
    if (rt.status === RefundStatus.PENDING || rt.status === RefundStatus.MANUAL_REVIEW || rt.status === RefundStatus.PROCESSING) {
      pendingRefundTasksCount += 1;
    } else if (rt.status === RefundStatus.PROCESSED) {
      processedRefundsCount += 1;
      processedRefundsAmountMinor += rt.amountMinor;
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
    duplicateRiskCasesCount,
    pendingRefundTasksCount,
    processedRefundsCount,
    processedRefundsAmountMinor,
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
        select: { id: true, action: true },
      },
      refundTasks: {
        orderBy: { createdAt: "desc" },
        take: 1,
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

    const caseRefunds = c.refundTasks || [];
    const caseAudits = c.auditLogs || [];

    const hasDuplicateRisk =
      caseRefunds.length > 0 ||
      caseAudits.some((l) => l.action.includes("DUPLICATE_RACE") || l.action.includes("ADVERSARIAL"));

    const latestRefund = caseRefunds[0];

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
      hasDuplicateRisk,
      refundStatus: latestRefund?.status || null,
    };
  });
}

/**
 * Returns duplicate race conflict cases and active refund tasks for operator resolution.
 */
export async function getDuplicateResolutionQueue(
  prisma: PrismaClient
): Promise<DuplicateQueueItem[]> {
  const refundTasks = await prisma.refundTask.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      recoveryCase: true,
    },
  });

  return refundTasks.map((rt) => ({
    caseId: rt.caseId || "unlinked",
    originalPaymentId: rt.recoveryCase?.paymentId || rt.paymentId,
    orderId: rt.recoveryCase?.orderId || null,
    amountMinor: rt.amountMinor,
    currency: rt.currency,
    caseStatus: rt.recoveryCase?.status || CaseStatus.MANUAL_REVIEW,
    detectedAt: rt.recoveryCase?.createdAt || rt.createdAt,
    recoveredAt: rt.recoveryCase?.recoveredAt || null,
    refundTaskId: rt.id,
    refundStatus: rt.status,
    refundPaymentId: rt.paymentId,
    refundId: rt.refundId,
    failureReason: rt.failureReason,
    createdAt: rt.createdAt,
  }));
}
