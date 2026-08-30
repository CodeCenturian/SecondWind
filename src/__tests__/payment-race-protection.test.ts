import { describe, it, expect, beforeEach } from "vitest";
import { CaseStatus, AttemptStatus, AttemptChannel, RefundStatus, AuditActorType } from "@prisma/client";
import { FakeRazorpayAdapter } from "../lib/adapters/provider-adapter";
import { reconcileRecoveryPayment } from "../lib/services/case-service";
import { executeRecoveryAction } from "../lib/services/orchestrator-service";
import { evaluateCorrelation } from "../lib/services/correlation-service";
import { getAccountingMetrics, getDuplicateResolutionQueue } from "../lib/services/accounting-service";
import { PolicyViolationError } from "../lib/errors";

describe("Adversarial Payment-Race Protection & Remediation", () => {
  let fakePrisma: any;
  let fakeAdapter: FakeRazorpayAdapter;

  let mockCasesStore: any[];
  let mockAttemptsStore: any[];
  let mockAuditStore: any[];
  let mockWebhookStore: any[];
  let mockRefundTaskStore: any[];

  const mockMerchantPolicy = {
    id: "pol_test_race_01",
    merchantId: "merch_race_protection",
    maxAttempts: 3,
    coolingPeriodMinutes: 30,
    linkExpiryMinutes: 1440,
    autoRefundEnabled: false, // Default off
    autoRefundThresholdMinor: 0n,
    allowPartialPayment: false,
    preferredChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    fakeAdapter = new FakeRazorpayAdapter();
    mockCasesStore = [];
    mockAttemptsStore = [];
    mockAuditStore = [];
    mockWebhookStore = [];
    mockRefundTaskStore = [];

    fakePrisma = {
      recoveryCase: {
        findUnique: async (args: any) => {
          const found = mockCasesStore.find((c) => c.id === args.where.id);
          if (!found) return null;
          return {
            ...found,
            attempts: mockAttemptsStore
              .filter((a) => a.caseId === found.id)
              .sort((a, b) => a.attemptNumber - b.attemptNumber),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === found.id),
            merchantPolicy: { ...mockMerchantPolicy },
          };
        },
        findFirst: async (args: any) => {
          const found = mockCasesStore.find((c) => c.paymentId === args.where.paymentId);
          if (!found) return null;
          return {
            ...found,
            attempts: mockAttemptsStore
              .filter((a) => a.caseId === found.id)
              .sort((a, b) => a.attemptNumber - b.attemptNumber),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === found.id),
            merchantPolicy: { ...mockMerchantPolicy },
          };
        },
        findMany: async (_args?: any) => {
          return mockCasesStore.map((c) => ({
            ...c,
            attempts: mockAttemptsStore.filter((a) => a.caseId === c.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === c.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === c.id),
          }));
        },
        update: async (args: any) => {
          const idx = mockCasesStore.findIndex((c) => c.id === args.where.id);
          if (idx === -1) throw new Error("Case not found");
          mockCasesStore[idx] = {
            ...mockCasesStore[idx],
            ...args.data,
            updatedAt: new Date(),
          };
          return mockCasesStore[idx];
        },
        updateMany: async (args: any) => {
          let count = 0;
          for (let i = 0; i < mockCasesStore.length; i++) {
            const c = mockCasesStore[i];
            if (c.id === args.where.id && (args.where.version === undefined || c.version === args.where.version)) {
              mockCasesStore[i] = {
                ...c,
                ...args.data,
                updatedAt: new Date(),
              };
              count++;
            }
          }
          return { count };
        },
      },
      recoveryAttempt: {
        findFirst: async (args: any) => {
          const found = mockAttemptsStore.find((a) => a.paymentLinkId === args.where.paymentLinkId);
          if (!found) return null;
          const caseRecord = mockCasesStore.find((c) => c.id === found.caseId);
          return {
            ...found,
            recoveryCase: {
              ...caseRecord,
              attempts: mockAttemptsStore.filter((a) => a.caseId === caseRecord.id),
              merchantPolicy: { ...mockMerchantPolicy },
              refundTasks: mockRefundTaskStore.filter((r) => r.caseId === caseRecord.id),
            },
          };
        },
        findMany: async (args?: any) => {
          if (args?.where?.metadata?.path) {
            const expectedToken = args.where.metadata.equals;
            const matches = mockAttemptsStore.filter(
              (a) => a.metadata && a.metadata.correlationToken === expectedToken
            );
            return matches.map((m) => ({
              ...m,
              recoveryCase: {
                ...mockCasesStore.find((c) => c.id === m.caseId),
                attempts: mockAttemptsStore.filter((a) => a.caseId === m.caseId),
                merchantPolicy: { ...mockMerchantPolicy },
                refundTasks: mockRefundTaskStore.filter((r) => r.caseId === m.caseId),
              },
            }));
          }
          return mockAttemptsStore;
        },
        create: async (args: any) => {
          const attempt = {
            id: `att_${mockAttemptsStore.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          };
          mockAttemptsStore.push(attempt);
          return attempt;
        },
        update: async (args: any) => {
          const idx = mockAttemptsStore.findIndex((a) => a.id === args.where.id);
          if (idx === -1) throw new Error("Attempt not found");
          mockAttemptsStore[idx] = {
            ...mockAttemptsStore[idx],
            ...args.data,
            updatedAt: new Date(),
          };
          return mockAttemptsStore[idx];
        },
        count: async () => mockAttemptsStore.length,
      },
      caseAuditLog: {
        create: async (args: any) => {
          const log = {
            id: `audit_${mockAuditStore.length + 1}`,
            createdAt: new Date(),
            ...args.data,
          };
          mockAuditStore.push(log);
          return log;
        },
      },
      refundTask: {
        findUnique: async (args: any) => {
          return mockRefundTaskStore.find((r) => r.idempotencyKey === args.where.idempotencyKey) || null;
        },
        findMany: async () => {
          return mockRefundTaskStore.map((rt) => ({
            ...rt,
            recoveryCase: mockCasesStore.find((c) => c.id === rt.caseId),
          }));
        },
        create: async (args: any) => {
          const task = {
            id: `rfnd_task_${mockRefundTaskStore.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          };
          mockRefundTaskStore.push(task);
          return task;
        },
      },
      webhookEvent: {
        count: async () => mockWebhookStore.length,
      },
      $transaction: async (fn: any) => fn(fakePrisma),
    };
  });

  function setupRecoveredCaseWithAttempt() {
    const originalPaymentId = "pay_orig_failed_100";
    const caseId = "case_race_01";
    const amountMinor = 75000n; // 750 INR

    const testCase = {
      id: caseId,
      merchantId: "merch_race_protection",
      paymentId: originalPaymentId,
      orderId: "order_race_100",
      customerEmail: "customer@example.com",
      customerPhone: "+919876543210",
      amountMinor,
      currency: "INR",
      status: CaseStatus.RECOVERED,
      version: 2,
      failedAt: new Date(Date.now() - 3600000), // 1 hour ago
      recoveredAt: new Date(Date.now() - 1800000), // 30 mins ago
      lastAttemptAt: new Date(Date.now() - 2000000),
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(),
    };
    mockCasesStore.push(testCase);

    const paidAttempt = {
      id: "att_race_01",
      caseId,
      attemptNumber: 1,
      channel: AttemptChannel.PAYMENT_LINK,
      status: AttemptStatus.PAID,
      paymentLinkId: "plink_race_100",
      paymentLinkUrl: "https://rzp.io/i/plink_race_100",
      metadata: {
        correlationToken: "rcov_corr_case_race_01_att1_123",
        capturedPaymentId: "pay_recovery_link_999",
        capturedAmountMinor: "75000",
        capturedCurrency: "INR",
      },
      createdAt: new Date(Date.now() - 2000000),
      updatedAt: new Date(Date.now() - 1800000),
    };
    mockAttemptsStore.push(paidAttempt);

    mockAuditStore.push({
      id: "audit_init_settled",
      caseId,
      action: "RECOVERY_VERIFIED_AND_SETTLED",
      actorType: AuditActorType.SYSTEM,
      newState: { status: CaseStatus.RECOVERED },
      createdAt: new Date(Date.now() - 1800000),
    });

    return { testCase, paidAttempt, originalPaymentId };
  }

  it("1. Late original event after verified recovery sets duplicate risk and blocks future recovery attempts", async () => {
    const { testCase, originalPaymentId } = setupRecoveredCaseWithAttempt();

    // Late webhook arrives for the original failed payment (now captured!)
    const reconResult = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_race_protection",
      caseId: testCase.id,
      providerPaymentId: originalPaymentId,
      amountMinor: 75000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_late_original_01",
      adapter: fakeAdapter,
    });

    expect(reconResult.matched).toBe(true);
    expect(reconResult.status).toBe("DUPLICATE_RISK_FLAGGED");

    // Case is flagged in MANUAL_REVIEW with DUPLICATE_RISK
    const caseAfter = mockCasesStore.find((c) => c.id === testCase.id);
    expect(caseAfter.status).toBe(CaseStatus.MANUAL_REVIEW);

    // Audit log records ADVERSARIAL_PAYMENT_RACE_DETECTED
    const raceAudit = mockAuditStore.find((l) => l.action === "ADVERSARIAL_PAYMENT_RACE_DETECTED");
    expect(raceAudit).toBeDefined();
    expect(raceAudit.metadata.originalPaymentId).toBe(originalPaymentId);
    expect(raceAudit.metadata.conflictingPaymentId).toBe(originalPaymentId);

    // Attempting any future recovery action on this case is immediately blocked by Policy Engine
    await expect(
      executeRecoveryAction(fakePrisma, {
        caseId: testCase.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: "idemp_attempt_blocked_race",
        expectedVersion: caseAfter.version,
        adapter: fakeAdapter,
      })
    ).rejects.toThrowError(PolicyViolationError);
  });

  it("2. Replayed late event creates only one RefundTask (Idempotent remediation)", async () => {
    const { testCase, originalPaymentId } = setupRecoveredCaseWithAttempt();

    // First late webhook delivery
    const firstRecon = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_race_protection",
      caseId: testCase.id,
      providerPaymentId: originalPaymentId,
      amountMinor: 75000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_late_01",
      adapter: fakeAdapter,
    });
    expect(firstRecon.status).toBe("DUPLICATE_RISK_FLAGGED");
    expect(mockRefundTaskStore.length).toBe(1);

    // Second repeated delivery of the same late webhook
    const secondRecon = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_race_protection",
      caseId: testCase.id,
      providerPaymentId: originalPaymentId,
      amountMinor: 75000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_late_02",
      adapter: fakeAdapter,
    });

    expect(secondRecon.matched).toBe(true);
    expect(secondRecon.isDuplicate).toBe(true);
    // Refund task is NOT duplicated
    expect(mockRefundTaskStore.length).toBe(1);
  });

  it("3. Provider refund failure leaves an auditable MANUAL_REVIEW state, not a false PROCESSED state", async () => {
    const { testCase, originalPaymentId } = setupRecoveredCaseWithAttempt();

    // Enable auto-refund in policy to test adapter call
    mockMerchantPolicy.autoRefundEnabled = true;
    fakeAdapter.shouldSimulateRefundError = true;
    fakeAdapter.simulatedErrorMessage = "Razorpay refund error: Insufficient merchant balance";

    const reconResult = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_race_protection",
      caseId: testCase.id,
      providerPaymentId: originalPaymentId,
      amountMinor: 75000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_late_error_01",
      adapter: fakeAdapter,
    });

    expect(reconResult.status).toBe("DUPLICATE_RISK_FLAGGED");
    expect(mockRefundTaskStore.length).toBe(1);

    const refundTask = mockRefundTaskStore[0];
    // Must be in MANUAL_REVIEW state with error recorded, NEVER PROCESSED
    expect(refundTask.status).toBe(RefundStatus.MANUAL_REVIEW);
    expect(refundTask.failureReason).toContain("Insufficient merchant balance");

    const failedAudit = mockAuditStore.find((l) => l.action === "AUTO_REFUND_FAILED_ROUTED_TO_MANUAL_REVIEW");
    expect(failedAudit).toBeDefined();

    // Reset policy
    mockMerchantPolicy.autoRefundEnabled = false;
  });

  it("4. Pure correlation never relies solely on matching nominal amount", () => {
    const candidateCase = {
      id: "case_anti_fuzzy",
      paymentId: "pay_failed_xyz",
      amountMinor: 50000n, // 500 INR
      currency: "INR",
      status: "DETECTED",
      attempts: [],
    };

    // Incoming payment with identical 500 INR amount, but entirely different payment ID and no references
    const decision = evaluateCorrelation(
      {
        paymentId: "pay_completely_unrelated_999",
        amountMinor: 50000n,
        currency: "INR",
        status: "captured",
        captured: true,
      },
      candidateCase
    );

    expect(decision.classification).toBe("NO_MATCH");
    expect(decision.confidence).toBe(0.0);
    expect(decision.recommendedAction).toBe("NONE");
    expect(decision.evidence.some((e) => e.includes("rejected under anti-fuzzy matching policy"))).toBe(true);
  });

  it("5. End-to-end race test confirms single-counted recovery metric and visible remediation queue", async () => {
    const { testCase, originalPaymentId } = setupRecoveredCaseWithAttempt();

    // Trigger late payment race
    await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_race_protection",
      caseId: testCase.id,
      providerPaymentId: originalPaymentId,
      amountMinor: 75000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_late_race_e2e",
      adapter: fakeAdapter,
    });

    // Verify Accounting Metrics: Zero Double Counting
    const metrics = await getAccountingMetrics(fakePrisma);
    expect(metrics.duplicateRiskCasesCount).toBe(1);
    expect(metrics.pendingRefundTasksCount).toBe(1);
    // Verified Recovered does not double-count (it only reflects the single settled recovery payment of 750 INR)
    expect(metrics.verifiedRecoveredAmountMinor).toBe(0n); // Since case moved to MANUAL_REVIEW

    // Verify Duplicate Resolution Queue
    const queue = await getDuplicateResolutionQueue(fakePrisma);
    expect(queue.length).toBe(1);
    expect(queue[0]?.caseId).toBe(testCase.id);
    expect(queue[0]?.refundPaymentId).toBe(originalPaymentId);
    expect(queue[0]?.refundStatus).toBe(RefundStatus.MANUAL_REVIEW);
  });
});
