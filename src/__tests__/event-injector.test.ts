import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CaseStatus, AttemptStatus, AttemptChannel } from "@prisma/client";
import {
  runInjectedScenario,
  assertDevEnvironment,
  ProductionEnvironmentError,
} from "../lib/services/injector-service";
import { getAccountingMetrics } from "../lib/services/accounting-service";

describe("Developer-Only Event Injector & Deterministic Scenarios", () => {
  let fakePrisma: any;
  let mockCasesStore: any[];
  let mockAttemptsStore: any[];
  let mockAuditStore: any[];
  let mockWebhookStore: any[];
  let mockRefundTaskStore: any[];
  let mockMerchantPolicyStore: any[];

  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockCasesStore = [];
    mockAttemptsStore = [];
    mockAuditStore = [];
    mockWebhookStore = [];
    mockRefundTaskStore = [];
    mockMerchantPolicyStore = [];

    fakePrisma = {
      merchantPolicy: {
        findUnique: async (args: any) =>
          mockMerchantPolicyStore.find((m) => m.merchantId === args.where.merchantId) || null,
        upsert: async (args: any) => {
          const found = mockMerchantPolicyStore.find((m) => m.merchantId === args.where.merchantId);
          if (found) return found;
          const created = { id: `pol_${Date.now()}`, ...args.create };
          mockMerchantPolicyStore.push(created);
          return created;
        },
      },
      recoveryCase: {
        findUnique: async (args: any) => {
          const found = mockCasesStore.find((c) => c.id === args.where.id);
          if (!found) return null;
          return {
            ...found,
            attempts: mockAttemptsStore.filter((a) => a.caseId === found.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === found.id),
            merchantPolicy: mockMerchantPolicyStore.find((m) => m.merchantId === found.merchantId) || null,
          };
        },
        findUniqueOrThrow: async (args: any) => {
          const found = mockCasesStore.find((c) => c.id === args.where.id);
          if (!found) throw new Error("Case not found");
          return {
            ...found,
            attempts: mockAttemptsStore.filter((a) => a.caseId === found.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === found.id),
            merchantPolicy: mockMerchantPolicyStore.find((m) => m.merchantId === found.merchantId) || null,
          };
        },
        findFirst: async (args: any) => {
          const found = mockCasesStore.find((c) => c.paymentId === args.where.paymentId);
          if (!found) return null;
          return {
            ...found,
            attempts: mockAttemptsStore.filter((a) => a.caseId === found.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === found.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === found.id),
            merchantPolicy: mockMerchantPolicyStore.find((m) => m.merchantId === found.merchantId) || null,
          };
        },
        findMany: async () =>
          mockCasesStore.map((c) => ({
            ...c,
            attempts: mockAttemptsStore.filter((a) => a.caseId === c.id),
            auditLogs: mockAuditStore.filter((l) => l.caseId === c.id),
            refundTasks: mockRefundTaskStore.filter((r) => r.caseId === c.id),
          })),
        create: async (args: any) => {
          const c = {
            id: `case_${mockCasesStore.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          };
          mockCasesStore.push(c);
          return c;
        },
        update: async (args: any) => {
          const idx = mockCasesStore.findIndex((c) => c.id === args.where.id);
          if (idx === -1) throw new Error("Case not found");
          mockCasesStore[idx] = { ...mockCasesStore[idx], ...args.data, updatedAt: new Date() };
          return mockCasesStore[idx];
        },
        updateMany: async (args: any) => {
          let count = 0;
          for (let i = 0; i < mockCasesStore.length; i++) {
            const c = mockCasesStore[i];
            if (c.id === args.where.id && (args.where.version === undefined || c.version === args.where.version)) {
              mockCasesStore[i] = { ...c, ...args.data, updatedAt: new Date() };
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
              attempts: mockAttemptsStore.filter((a) => a.caseId === caseRecord?.id),
              merchantPolicy: mockMerchantPolicyStore.find((m) => m.merchantId === caseRecord?.merchantId) || null,
              refundTasks: mockRefundTaskStore.filter((r) => r.caseId === caseRecord?.id),
            },
          };
        },
        findMany: async (args?: any) => {
          if (args?.where?.caseId) {
            return mockAttemptsStore.filter((a) => a.caseId === args.where.caseId);
          }
          return mockAttemptsStore;
        },
        create: async (args: any) => {
          const att = {
            id: `att_${mockAttemptsStore.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...args.data,
          };
          mockAttemptsStore.push(att);
          return att;
        },
        update: async (args: any) => {
          const idx = mockAttemptsStore.findIndex((a) => a.id === args.where.id);
          if (idx === -1) throw new Error("Attempt not found");
          mockAttemptsStore[idx] = { ...mockAttemptsStore[idx], ...args.data, updatedAt: new Date() };
          return mockAttemptsStore[idx];
        },
        count: async () => mockAttemptsStore.length,
      },
      caseAuditLog: {
        create: async (args: any) => {
          const log = { id: `audit_${mockAuditStore.length + 1}`, createdAt: new Date(), ...args.data };
          mockAuditStore.push(log);
          return log;
        },
      },
      webhookEvent: {
        findUnique: async (args: any) =>
          mockWebhookStore.find((w) => w.eventId === args.where.eventId) || null,
        create: async (args: any) => {
          const existing = mockWebhookStore.find((w) => w.eventId === args.data.eventId);
          if (existing) {
            const err: any = new Error("Unique constraint failed on eventId");
            err.code = "P2002";
            throw err;
          }
          const evt = { id: `evt_${mockWebhookStore.length + 1}`, createdAt: new Date(), ...args.data };
          mockWebhookStore.push(evt);
          return evt;
        },
        update: async (args: any) => {
          const idx = mockWebhookStore.findIndex((w) => w.eventId === args.where.eventId);
          if (idx !== -1) {
            mockWebhookStore[idx] = { ...mockWebhookStore[idx], ...args.data };
            return mockWebhookStore[idx];
          }
          return null;
        },
        count: async () => mockWebhookStore.length,
      },
      refundTask: {
        findUnique: async (args: any) =>
          mockRefundTaskStore.find((r) => r.idempotencyKey === args.where.idempotencyKey) || null,
        findMany: async () => mockRefundTaskStore,
        create: async (args: any) => {
          const rt = { id: `rfnd_${mockRefundTaskStore.length + 1}`, createdAt: new Date(), ...args.data };
          mockRefundTaskStore.push(rt);
          return rt;
        },
      },
      $transaction: async (fn: any) => fn(fakePrisma),
    };
  });

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  it("1. Injector is unavailable in production (Throws ProductionEnvironmentError)", async () => {
    (process.env as any).NODE_ENV = "production";

    expect(() => assertDevEnvironment()).toThrowError(ProductionEnvironmentError);

    await expect(
      runInjectedScenario(fakePrisma, "DUPLICATE_WEBHOOK_DELIVERY")
    ).rejects.toThrowError(ProductionEnvironmentError);
  });

  it("2. Injector makes zero real Razorpay API calls (Runs via FakeRazorpayAdapter)", async () => {
    (process.env as any).NODE_ENV = "development";

    const result = await runInjectedScenario(fakePrisma, "RETRY_AFTER_TIMEOUT");
    expect(result.success).toBe(true);
    expect(result.logs.some((l) => l.includes("FakeRazorpayAdapter"))).toBe(true);
  });

  it("3. Injected simulation records do not contribute to verified-money queries", async () => {
    (process.env as any).NODE_ENV = "development";

    // Run late original authorization scenario which settles a simulated recovery attempt
    await runInjectedScenario(fakePrisma, "LATE_ORIGINAL_AUTHORIZATION");

    // Manually mark a recovery attempt with isSimulation: true
    mockAttemptsStore.push({
      id: "att_sim_settled",
      caseId: "case_sim_01",
      attemptNumber: 1,
      channel: AttemptChannel.PAYMENT_LINK,
      status: AttemptStatus.PAID,
      metadata: {
        isSimulation: true,
        capturedPaymentId: "pay_sim_123",
        webhookEventId: "evt_sim_123",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockCasesStore.push({
      id: "case_sim_01",
      merchantId: "merch_dev_sandbox",
      paymentId: "pay_sim_failed",
      amountMinor: 500000n, // ₹5,000.00
      currency: "INR",
      status: CaseStatus.RECOVERED,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const metrics = await getAccountingMetrics(fakePrisma);
    // Invariant: isSimulation records CANNOT increment verifiedRecoveredAmountMinor
    expect(metrics.verifiedRecoveredAmountMinor).toBe(0n);
    expect(metrics.verifiedRecoveredCount).toBe(0);
  });

  it("4. Deterministic scenario 1: DUPLICATE_WEBHOOK_DELIVERY", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "DUPLICATE_WEBHOOK_DELIVERY");
    expect(res.success).toBe(true);
    expect(res.data["firstClaimDuplicate"]).toBe(false);
    expect(res.data["secondClaimDuplicate"]).toBe(true);
  });

  it("5. Deterministic scenario 2: OUT_OF_ORDER_EVENTS", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "OUT_OF_ORDER_EVENTS");
    expect(res.success).toBe(true);
    expect(res.data["reconStatus"]).toBe("NO_MATCH");
  });

  it("6. Deterministic scenario 3: RETRY_AFTER_TIMEOUT", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "RETRY_AFTER_TIMEOUT");
    expect(res.success).toBe(true);
    expect(res.data["attemptStatus"]).toBe(AttemptStatus.SENT);
  });

  it("7. Deterministic scenario 4: LATE_ORIGINAL_AUTHORIZATION", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "LATE_ORIGINAL_AUTHORIZATION");
    expect(res.success).toBe(true);
    expect(res.data["raceStatus"]).toBe("DUPLICATE_RISK_FLAGGED");
    expect(res.data["refundTaskId"]).toBeDefined();
  });

  it("8. Deterministic scenario 5: DUPLICATE_RECOVERY_CAPTURE", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "DUPLICATE_RECOVERY_CAPTURE");
    expect(res.success).toBe(true);
    expect(res.data["firstStatus"]).toBe("RECOVERED");
    expect(res.data["secondStatus"]).toBe("ALREADY_RECOVERED");
  });

  it("9. Deterministic scenario 6: PROVIDER_TIMEOUT", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "PROVIDER_TIMEOUT");
    expect(res.success).toBe(true);
    expect(res.data["failedAsExpected"]).toBe(true);
  });

  it("10. Deterministic scenario 7: INVALID_EVENT_SHAPE", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "INVALID_EVENT_SHAPE");
    expect(res.success).toBe(true);
    expect(res.data["status"]).toBe("FAILED");
  });

  it("11. Deterministic scenario 8: POLICY_VERSION_CHANGE", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "POLICY_VERSION_CHANGE");
    expect(res.success).toBe(true);
    expect(res.data["outcome"]).toBe("MANUAL_REVIEW");
    expect(res.data["reasons"]).toContain("STALE_POLICY_VERSION");
  });

  it("12. Deterministic scenario 9: DO_NOT_CONTACT_AFTER_ATTEMPT", async () => {
    (process.env as any).NODE_ENV = "test";
    const res = await runInjectedScenario(fakePrisma, "DO_NOT_CONTACT_AFTER_ATTEMPT");
    expect(res.success).toBe(true);
    expect(res.data["outcome"]).toBe("STOP");
    expect(res.data["reasons"]).toContain("CUSTOMER_DO_NOT_CONTACT");
  });
});
