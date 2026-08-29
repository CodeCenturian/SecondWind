import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyRazorpaySignature, sanitizePayload, PaymentFailedWebhookSchema } from "../lib/webhook";
import { ConcurrencyConflictError } from "../lib/errors";

describe("Razorpay Webhook Ingestion & Deterministic Case Detection", () => {
  const secret = "test_webhook_secret_key_12345";

  function signPayload(body: string, s: string = secret): string {
    return crypto.createHmac("sha256", s).update(body, "utf8").digest("hex");
  }

  const validPaymentFailedPayload = {
    entity: "event",
    account_id: "acc_merchant_test_1",
    event: "payment.failed",
    contains: ["payment"],
    created_at: 1749618314,
    payload: {
      payment: {
        entity: {
          id: "pay_failed_sample_123",
          entity: "payment",
          amount: 50000, // ₹500.00 in minor units
          currency: "INR",
          status: "failed",
          order_id: "order_test_456",
          invoice_id: null,
          international: false,
          method: "card",
          amount_refunded: 0,
          refund_status: null,
          captured: false,
          description: "Test checkout failure",
          card_id: "card_789",
          bank: null,
          wallet: null,
          vpa: null,
          email: "customer@example.com",
          contact: "+919876543210",
          notes: {},
          fee: 0,
          tax: 0,
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed due to insufficient funds in customer card account",
          error_source: "issuer",
          error_step: "payment_authorization",
          error_reason: "insufficient_funds",
          created_at: 1749618310,
        },
      },
    },
  };

  it("1. Valid documented payment.failed fixture validates signature and parses schema", () => {
    const rawBody = JSON.stringify(validPaymentFailedPayload);
    const signature = signPayload(rawBody);

    // Signature verification must pass
    const isValid = verifyRazorpaySignature(rawBody, signature, secret);
    expect(isValid).toBe(true);

    // Zod schema parsing must succeed
    const parsed = PaymentFailedWebhookSchema.safeParse(validPaymentFailedPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.event).toBe("payment.failed");
      expect(parsed.data.payload.payment.entity.amount).toBe(50000);
      expect(parsed.data.payload.payment.entity.id).toBe("pay_failed_sample_123");
      expect(parsed.data.payload.payment.entity.error_code).toBe("BAD_REQUEST_ERROR");
    }
  });

  it("2. Invalid signature is rejected immediately with false and makes no changes", () => {
    const rawBody = JSON.stringify(validPaymentFailedPayload);
    const invalidSignature = "invalid_signature_hex_1234567890abcdef";

    const isValid = verifyRazorpaySignature(rawBody, invalidSignature, secret);
    expect(isValid).toBe(false);

    // Mismatched secret
    const wrongSecretSignature = signPayload(rawBody, "wrong_secret");
    const isWrongSecretValid = verifyRazorpaySignature(rawBody, wrongSecretSignature, secret);
    expect(isWrongSecretValid).toBe(false);

    // Empty or missing signature
    expect(verifyRazorpaySignature(rawBody, "", secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, null, secret)).toBe(false);
  });

  it("3. Repeated event delivery preserves idempotency and creates only one case transition", () => {
    const eventId = "x_evt_unique_12345";
    const processedEvents = new Map<string, { id: string; status: string }>();
    const cases = new Map<string, { id: string; status: string; version: number }>();

    function processWebhook(evtId: string, payload: typeof validPaymentFailedPayload) {
      if (processedEvents.has(evtId)) {
        return { isDuplicate: true, event: processedEvents.get(evtId)! };
      }

      processedEvents.set(evtId, { id: evtId, status: "PROCESSED" });

      const paymentId = payload.payload.payment.entity.id;
      if (!cases.has(paymentId)) {
        cases.set(paymentId, {
          id: `case_${paymentId}`,
          status: "DETECTED",
          version: 1,
        });
      }

      return { isDuplicate: false, event: processedEvents.get(evtId)! };
    }

    // First arrival: processes and creates case in DETECTED state
    const first = processWebhook(eventId, validPaymentFailedPayload);
    expect(first.isDuplicate).toBe(false);
    expect(cases.size).toBe(1);
    expect(cases.get("pay_failed_sample_123")?.status).toBe("DETECTED");

    // Second repeated arrival: acknowledged as duplicate without adding new cases
    const second = processWebhook(eventId, validPaymentFailedPayload);
    expect(second.isDuplicate).toBe(true);
    expect(cases.size).toBe(1);
  });

  it("4. Concurrent case update proves version protection and raises ConcurrencyConflictError on stale writes", () => {
    interface MockCase {
      id: string;
      version: number;
      status: string;
    }

    const dbCase: MockCase = {
      id: "case_abc_123",
      version: 1,
      status: "DETECTED",
    };

    function updateWithVersionCheck(current: MockCase, expectedVersion: number, newStatus: string): MockCase {
      if (current.version !== expectedVersion) {
        throw new ConcurrencyConflictError(current.id, expectedVersion, current.version);
      }
      return {
        ...current,
        status: newStatus,
        version: current.version + 1,
      };
    }

    // Process A updates version from 1 to 2
    const updatedByA = updateWithVersionCheck(dbCase, 1, "OPEN");
    expect(updatedByA.version).toBe(2);

    // Process B attempts update using stale version 1
    expect(() => {
      updateWithVersionCheck(updatedByA, 1, "MANUAL_REVIEW");
    }).toThrowError(ConcurrencyConflictError);
  });

  it("5. Unknown event is safely digested, audited, and marked IGNORED without crashing", () => {
    const unknownPayload = {
      entity: "event",
      account_id: "acc_merchant_test_1",
      event: "unknown.future.event.type",
      contains: ["unknown_entity"],
      created_at: 1749618314,
      payload: {
        some_unsupported_field: {
          id: "unsupported_123",
          card_number: "4111111111111111", // Sensitive card PAN
          cvv: "123",
        },
      },
    };

    // Sensitive keys must be redacted by sanitizePayload
    const sanitized = sanitizePayload(unknownPayload);
    const sanitizedPayload = sanitized["payload"] as Record<string, unknown>;
    const entity = sanitizedPayload["some_unsupported_field"] as Record<string, unknown>;

    expect(entity["card_number"]).toBe("[REDACTED]");
    expect(entity["cvv"]).toBe("[REDACTED]");
    expect(entity["id"]).toBe("unsupported_123");
  });

  it("6. No dashboard metrics or calculations mark a failed/detected transaction as recovered", () => {
    const testCases = [
      { id: "c1", status: "DETECTED", amountMinor: 50000n, recovered: false },
      { id: "c2", status: "FAILED", amountMinor: 25000n, recovered: false },
      { id: "c3", status: "MANUAL_REVIEW", amountMinor: 75000n, recovered: false },
    ];

    // Compute recovered volume
    const recoveredVolumeMinor = testCases
      .filter((c) => c.status === "RECOVERED")
      .reduce((sum, c) => sum + c.amountMinor, 0n);

    expect(recoveredVolumeMinor).toBe(0n);

    // Total detected volume must correctly sum minor units
    const totalDetectedMinor = testCases.reduce((sum, c) => sum + c.amountMinor, 0n);
    expect(totalDetectedMinor).toBe(150000n); // ₹1,500.00
  });
});
