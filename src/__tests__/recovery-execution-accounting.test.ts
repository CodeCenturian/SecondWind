import { describe, it, expect, beforeEach } from "vitest";
import { CaseStatus, AttemptStatus, AttemptChannel } from "@prisma/client";
import { executeRecoveryAction } from "../lib/services/orchestrator-service";
import { FakeRazorpayAdapter } from "../lib/adapters/provider-adapter";
import { reconcileRecoveryPayment } from "../lib/services/case-service";
import { getAccountingMetrics, getReconciliationLedger } from "../lib/services/accounting-service";

describe("Recovery Execution, Authoritative Webhook Settlement & Accounting Invariants", () => {
  let fakePrisma: any;
  let fakeAdapter: FakeRazorpayAdapter;

  let mockCasesStore: any[];
  let mockAttemptsStore: any[];
  let mockAuditStore: any[];
  let mockWebhookStore: any[];

  const mockMerchantPolicy = {
    id: "pol_test_01",
    merchantId: "merch_test_accounting",
    maxAttempts: 3,
    coolingPeriodMinutes: 30,
    linkExpiryMinutes: 1440,
    autoRefundEnabled: false,
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
            merchantPolicy: { ...mockMerchantPolicy },
          };
        },
        findUniqueOrThrow: async (args: any) => {
          const found = mockCasesStore.find((c) => c.id === args.where.id);
          if (!found) throw new Error(`Case ${args.where.id} not found`);
          return {
            ...found,
            attempts: mockAttemptsStore
              .filter((a) => a.caseId === found.id)
              .sort((a, b) => a.attemptNumber - b.attemptNumber),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            merchantPolicy: { ...mockMerchantPolicy },
          };
        },
        findMany: async (_args?: any) => {
          return mockCasesStore.map((c) => ({
            ...c,
            attempts: mockAttemptsStore.filter((a) => a.caseId === c.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === c.id),
          }));
        },
        create: async (args: any) => {
          const newCase = {
            id: args.data.id || `case_${mockCasesStore.length + 1}`,
            merchantPolicy: { ...mockMerchantPolicy },
            attempts: [],
            auditLogs: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          };
          mockCasesStore.push(newCase);
          return newCase;
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
              auditLogs: mockAuditStore.filter((l) => l.caseId === caseRecord.id),
              merchantPolicy: { ...mockMerchantPolicy },
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
                auditLogs: mockAuditStore.filter((l) => l.caseId === m.caseId),
                merchantPolicy: { ...mockMerchantPolicy },
              },
            }));
          }
          if (args?.where?.caseId) {
            return mockAttemptsStore.filter((a) => a.caseId === args.where.caseId);
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
      webhookEvent: {
        count: async () => mockWebhookStore.length,
      },
      $transaction: async (fn: any) => fn(fakePrisma),
    };
  });

  function createMockCase(
    paymentId: string,
    amountMinor: bigint = 50000n,
    currency: string = "INR"
  ) {
    const newCase = {
      id: `case_${paymentId}`,
      merchantId: "merch_test_accounting",
      paymentId,
      orderId: `order_${paymentId}`,
      customerEmail: "user@example.com",
      customerPhone: "+919876543210",
      amountMinor,
      currency,
      status: CaseStatus.DETECTED,
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: "Card declined by bank",
      version: 1,
      failedAt: new Date(),
      recoveredAt: null,
      lastAttemptAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCasesStore.push(newCase);
    return newCase;
  }

  it("TEST 1: Payment link creation alone does NOT increment recovered amount", async () => {
    const testCase = createMockCase("pay_test_01", 100000n); // 1,000 INR

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    expect(actionResult.success).toBe(true);
    expect(actionResult.attempt.status).toBe(AttemptStatus.SENT);
    expect(actionResult.updatedCase.status).toBe(CaseStatus.IN_PROGRESS);

    // Verify Accounting Metrics: Verified Recovered must remain ₹0.00
    const metrics = await getAccountingMetrics(fakePrisma);
    expect(metrics.verifiedRecoveredAmountMinor).toBe(0n);
    expect(metrics.verifiedRecoveredCount).toBe(0);

    // Operational metrics count the pipeline correctly
    expect(metrics.totalDetectedVolumeMinor).toBe(100000n);
    expect(metrics.inProgressCasesCount).toBe(1);
    expect(metrics.operationalAttemptsCount).toBe(1);

    // Verify opaque correlation token is present in metadata
    const meta = actionResult.attempt.metadata as Record<string, unknown>;
    expect(meta["correlationToken"]).toBeDefined();
    expect(String(meta["correlationToken"])).toContain("rcov_corr_");
  });

  it("TEST 2: Non-captured / authorized-only payment status does NOT increment recovered amount", async () => {
    const testCase = createMockCase("pay_test_02", 75000n); // 750 INR

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    const plinkId = actionResult.attempt.paymentLinkId;

    // Simulate incoming payment event that is authorized, but NOT captured (captured: false)
    const reconResult = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: plinkId,
      providerPaymentId: "pay_auth_only_999",
      amountMinor: 75000n,
      currency: "INR",
      status: "authorized",
      captured: false, // NOT captured
      webhookEventId: "evt_auth_01",
    });

    expect(reconResult.matched).toBe(true);
    expect(reconResult.transitionedToRecovered).toBe(false);
    expect(reconResult.status).toBe("NON_CAPTURED_IGNORED");

    // Case remains IN_PROGRESS; recovered amount stays 0
    const metrics = await getAccountingMetrics(fakePrisma);
    expect(metrics.verifiedRecoveredAmountMinor).toBe(0n);
    expect(metrics.verifiedRecoveredCount).toBe(0);
  });

  it("TEST 3: Authoritative captured webhook with matching correlation settles case to RECOVERED", async () => {
    const testCase = createMockCase("pay_test_03", 150000n); // 1,500 INR

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    const plinkId = actionResult.attempt.paymentLinkId;
    const meta = actionResult.attempt.metadata as Record<string, unknown>;
    const correlationToken = meta["correlationToken"] as string;

    // Simulate authoritative captured payment webhook
    const reconResult = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: plinkId,
      correlationToken,
      providerPaymentId: "pay_captured_777",
      amountMinor: 150000n,
      currency: "INR",
      status: "captured",
      captured: true, // Confirmed captured
      webhookEventId: "evt_cap_01",
    });

    expect(reconResult.matched).toBe(true);
    expect(reconResult.transitionedToRecovered).toBe(true);
    expect(reconResult.status).toBe("RECOVERED");

    // Accounting queries reflect exact recovered amount
    const metrics = await getAccountingMetrics(fakePrisma);
    expect(metrics.verifiedRecoveredAmountMinor).toBe(150000n);
    expect(metrics.verifiedRecoveredCount).toBe(1);

    // Audit log records authoritative settlement
    expect(
      mockAuditStore.some((l) => l.action === "RECOVERY_VERIFIED_AND_SETTLED")
    ).toBe(true);
  });

  it("TEST 4: Duplicate capture webhooks do NOT double count or double transition", async () => {
    const testCase = createMockCase("pay_test_04", 50000n);

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    const plinkId = actionResult.attempt.paymentLinkId;

    // First Webhook: Settles case
    const firstRecon = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: plinkId,
      providerPaymentId: "pay_captured_888",
      amountMinor: 50000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_dup_1",
    });
    expect(firstRecon.transitionedToRecovered).toBe(true);

    const metricsAfterFirst = await getAccountingMetrics(fakePrisma);
    expect(metricsAfterFirst.verifiedRecoveredAmountMinor).toBe(50000n);

    // Second Webhook: Duplicate event delivery
    const secondRecon = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: plinkId,
      providerPaymentId: "pay_captured_888",
      amountMinor: 50000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_dup_2",
    });

    expect(secondRecon.matched).toBe(true);
    expect(secondRecon.isDuplicate).toBe(true);
    expect(secondRecon.transitionedToRecovered).toBe(false);
    expect(secondRecon.status).toBe("ALREADY_RECOVERED");

    // Amount must NOT double count
    const metricsAfterSecond = await getAccountingMetrics(fakePrisma);
    expect(metricsAfterSecond.verifiedRecoveredAmountMinor).toBe(50000n);
    expect(metricsAfterSecond.verifiedRecoveredCount).toBe(1);
  });

  it("TEST 5: Amount / currency mismatch transitions case to MANUAL_REVIEW and does not count as recovered", async () => {
    const testCase = createMockCase("pay_test_05", 200000n, "INR"); // 2,000 INR expected

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    const plinkId = actionResult.attempt.paymentLinkId;

    // Underpaid webhook: only 1,000 INR received
    const reconResult = await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: plinkId,
      providerPaymentId: "pay_mismatch_999",
      amountMinor: 100000n, // Mismatch!
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_mismatch_01",
    });

    expect(reconResult.matched).toBe(true);
    expect(reconResult.transitionedToRecovered).toBe(false);
    expect(reconResult.status).toBe("MANUAL_REVIEW");

    // Case is in MANUAL_REVIEW; recovered amount is NOT incremented
    const metrics = await getAccountingMetrics(fakePrisma);
    expect(metrics.verifiedRecoveredAmountMinor).toBe(0n);
    expect(metrics.manualReviewCasesCount).toBe(1);
  });

  it("TEST 6: Reconciliation ledger builds full provenance chain for every case", async () => {
    const testCase = createMockCase("pay_test_06", 120000n);

    const actionResult = await executeRecoveryAction(fakePrisma, {
      caseId: testCase.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: `idemp_${testCase.id}_v1`,
      expectedVersion: 1,
      adapter: fakeAdapter,
    });

    await reconcileRecoveryPayment(fakePrisma, {
      merchantId: "merch_test_accounting",
      providerPaymentLinkId: actionResult.attempt.paymentLinkId,
      providerPaymentId: "pay_prov_123",
      amountMinor: 120000n,
      currency: "INR",
      status: "captured",
      captured: true,
      webhookEventId: "evt_prov_01",
    });

    const ledger = await getReconciliationLedger(fakePrisma);
    expect(ledger.length).toBe(1);

    const item = ledger[0];
    expect(item?.caseId).toBe(testCase.id);
    expect(item?.providerPaymentLinkId).toBe(actionResult.attempt.paymentLinkId);
    expect(item?.providerCapturedPaymentId).toBe("pay_prov_123");
    expect(item?.verifiedWebhookEventId).toBe("evt_prov_01");
    expect(item?.caseStatus).toBe(CaseStatus.RECOVERED);
    expect(item?.verifiedCapturedAmountMinor).toBe(120000n);
  });
});
