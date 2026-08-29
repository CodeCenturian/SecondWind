import { describe, it, expect, beforeEach } from "vitest";
import { executeRecoveryAction } from "../lib/services/orchestrator-service";
import { FakeRazorpayAdapter } from "../lib/adapters/provider-adapter";
import { CaseStatus, AttemptChannel, AuditActorType } from "@prisma/client";
import { ConcurrencyConflictError, PolicyViolationError } from "../lib/errors";

describe("Bounded Recovery Orchestrator & Provider Adapter Tests", () => {
  let fakePrisma: any;
  let fakeAdapter: FakeRazorpayAdapter;

  const mockMerchantPolicy = {
    id: "pol_uuid_123",
    merchantId: "acc_test_merchant_1",
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

  let mockCaseStore: any;
  let mockAttemptStore: any[];
  let mockAuditStore: any[];

  beforeEach(() => {
    fakeAdapter = new FakeRazorpayAdapter();
    mockAttemptStore = [];
    mockAuditStore = [];

    mockCaseStore = {
      id: "case_test_uuid_999",
      merchantId: "acc_test_merchant_1",
      paymentId: "pay_test_failed_888",
      orderId: "order_test_777",
      customerEmail: "user@example.com",
      customerPhone: "+919876543210",
      amountMinor: 50000n, // ₹500.00
      currency: "INR",
      status: CaseStatus.DETECTED,
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: "Payment failed due to customer card authorization issue",
      strategy: null,
      version: 1,
      failedAt: new Date(),
      recoveredAt: null,
      lastAttemptAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      attempts: mockAttemptStore,
      merchantPolicy: { ...mockMerchantPolicy },
    };

    fakePrisma = {
      recoveryCase: {
        findUnique: async () => ({
          ...mockCaseStore,
          attempts: [...mockAttemptStore],
        }),
        findUniqueOrThrow: async () => ({
          ...mockCaseStore,
          attempts: [...mockAttemptStore],
        }),
        updateMany: async (args: any) => {
          if (mockCaseStore.version === args.where.version) {
            mockCaseStore.version += 1;
            mockCaseStore.status = args.data.status;
            mockCaseStore.lastAttemptAt = args.data.lastAttemptAt;
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
      recoveryAttempt: {
        create: async (args: any) => {
          const attempt = {
            id: `att_${mockAttemptStore.length + 1}`,
            ...args.data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockAttemptStore.push(attempt);
          return attempt;
        },
      },
      caseAuditLog: {
        create: async (args: any) => {
          const log = {
            id: `audit_${mockAuditStore.length + 1}`,
            ...args.data,
            createdAt: new Date(),
          };
          mockAuditStore.push(log);
          return log;
        },
      },
      $transaction: async (fn: any) => fn(fakePrisma),
    };
  });

  it("1. Action request replayed with the same idempotency key creates only one attempt", async () => {
    const key = "idem_key_unique_session_1";

    // First request
    const firstResult = await executeRecoveryAction(fakePrisma, {
      caseId: mockCaseStore.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: key,
      expectedVersion: 1,
      actorId: "operator_1",
      actorType: AuditActorType.OPERATOR,
      adapter: fakeAdapter,
    });

    expect(firstResult.success).toBe(true);
    expect(firstResult.isDuplicateRequest).toBe(false);
    expect(firstResult.attempt.paymentLinkId).toBeTruthy();
    expect(mockAttemptStore.length).toBe(1);
    expect(mockCaseStore.version).toBe(2);

    // Second repeated request with the same idempotency key
    const replayResult = await executeRecoveryAction(fakePrisma, {
      caseId: mockCaseStore.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: key,
      expectedVersion: 2,
      actorId: "operator_1",
      actorType: AuditActorType.OPERATOR,
      adapter: fakeAdapter,
    });

    expect(replayResult.success).toBe(true);
    expect(replayResult.isDuplicateRequest).toBe(true);
    expect(replayResult.attempt.id).toBe(firstResult.attempt.id);
    expect(mockAttemptStore.length).toBe(1); // No new attempt created
    expect(mockCaseStore.version).toBe(2); // No extra version increment
  });

  it("2. Optimistic concurrency mismatch is rejected with ConcurrencyConflictError and no silent write", async () => {
    await expect(
      executeRecoveryAction(fakePrisma, {
        caseId: mockCaseStore.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: "key_concurrency_1",
        expectedVersion: 99, // Stale version (actual is 1)
        actorId: "operator_1",
        adapter: fakeAdapter,
      })
    ).rejects.toThrowError(ConcurrencyConflictError);

    expect(mockAttemptStore.length).toBe(0);
    expect(mockCaseStore.version).toBe(1);
  });

  it("3. Low-confidence diagnosis never triggers an action", async () => {
    // Override case policy to trigger stop
    mockCaseStore.merchantPolicy = { ...mockMerchantPolicy, maxAttempts: 0 };

    await expect(
      executeRecoveryAction(fakePrisma, {
        caseId: mockCaseStore.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: "key_stopped_policy",
        expectedVersion: 1,
        actorId: "operator_1",
        adapter: fakeAdapter,
      })
    ).rejects.toThrowError(PolicyViolationError);

    expect(mockAttemptStore.length).toBe(0);
    expect(fakeAdapter.createdLinks.size).toBe(0);
  });

  it("4. Audit log contains policy version, decision, reasons, actor, and before/after state", async () => {
    const result = await executeRecoveryAction(fakePrisma, {
      caseId: mockCaseStore.id,
      requestedChannel: AttemptChannel.PAYMENT_LINK,
      idempotencyKey: "key_audit_test_1",
      expectedVersion: 1,
      actorId: "operator_ashutosh",
      actorType: AuditActorType.OPERATOR,
      adapter: fakeAdapter,
    });

    expect(result.success).toBe(true);
    expect(mockAuditStore.length).toBe(1);

    const auditEntry = mockAuditStore[0];
    expect(auditEntry.action).toBe("RECOVERY_ACTION_TRIGGERED");
    expect(auditEntry.actorType).toBe(AuditActorType.OPERATOR);
    expect(auditEntry.actorId).toBe("operator_ashutosh");
    expect(auditEntry.previousState.version).toBe(1);
    expect(auditEntry.newState.version).toBe(2);
    expect(auditEntry.metadata.decision.policyVersion).toBe("v1");
    expect(auditEntry.metadata.decision.reasons).toContain("POLICY_RULES_SATISFIED");
  });

  it("5. External adapter call occurs outside database transactions and records failure if provider errors", async () => {
    fakeAdapter.shouldSimulateError = true;
    fakeAdapter.simulatedErrorMessage = "Razorpay service 503 unavailable";

    await expect(
      executeRecoveryAction(fakePrisma, {
        caseId: mockCaseStore.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: "key_provider_error",
        expectedVersion: 1,
        actorId: "operator_1",
        adapter: fakeAdapter,
      })
    ).rejects.toThrowError(/Provider payment link creation failed/);

    // Attempt was not created in DB transaction
    expect(mockAttemptStore.length).toBe(0);
    // Audit log records provider failure
    expect(mockAuditStore.some((l) => l.action === "PROVIDER_LINK_CREATION_FAILED")).toBe(true);
  });
});
