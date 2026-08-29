import { describe, it, expect } from "vitest";
import { ConcurrencyConflictError, DuplicateEventError } from "../lib/errors";

describe("Optimistic Concurrency & Idempotency Invariants", () => {
  interface MockRecoveryCase {
    id: string;
    version: number;
    status: string;
    lastAttemptAt: Date | null;
  }

  /**
   * Simulates the optimistic locking database update:
   * UPDATE "RecoveryCase" SET version = version + 1, status = $newStatus
   * WHERE id = $caseId AND version = $expectedVersion;
   */
  function applyOptimisticUpdate(
    currentCase: MockRecoveryCase,
    expectedVersion: number,
    updateFn: (c: MockRecoveryCase) => Partial<MockRecoveryCase>
  ): MockRecoveryCase {
    if (currentCase.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        currentCase.id,
        expectedVersion,
        currentCase.version
      );
    }

    const changes = updateFn(currentCase);
    return {
      ...currentCase,
      ...changes,
      version: currentCase.version + 1,
    };
  }

  it("should successfully apply state transition when versions match", () => {
    let mockCase: MockRecoveryCase = {
      id: "case-uuid-1",
      version: 1,
      status: "OPEN",
      lastAttemptAt: null,
    };

    // First update at version 1
    mockCase = applyOptimisticUpdate(mockCase, 1, () => ({
      status: "IN_PROGRESS",
      lastAttemptAt: new Date(),
    }));

    expect(mockCase.version).toBe(2);
    expect(mockCase.status).toBe("IN_PROGRESS");
    expect(mockCase.lastAttemptAt).not.toBeNull();
  });

  it("should reject concurrent update when expected version is stale", () => {
    const originalCase: MockRecoveryCase = {
      id: "case-uuid-1",
      version: 1,
      status: "OPEN",
      lastAttemptAt: null,
    };

    // Thread A updates to version 2
    const threadACase = applyOptimisticUpdate(originalCase, 1, () => ({
      status: "IN_PROGRESS",
    }));
    expect(threadACase.version).toBe(2);

    // Thread B tries to update using stale version 1
    expect(() => {
      applyOptimisticUpdate(threadACase, 1, () => ({
        status: "MANUAL_REVIEW",
      }));
    }).toThrowError(ConcurrencyConflictError);

    try {
      applyOptimisticUpdate(threadACase, 1, () => ({
        status: "MANUAL_REVIEW",
      }));
    } catch (err: unknown) {
      const conflict = err as ConcurrencyConflictError;
      expect(conflict.statusCode).toBe(409);
      expect(conflict.code).toBe("CONCURRENCY_CONFLICT");
      expect(conflict.details?.["expectedVersion"]).toBe(1);
      expect(conflict.details?.["actualVersion"]).toBe(2);
    }
  });

  it("should prevent duplicate webhook event ingestion", () => {
    const recordedEvents = new Set<string>();

    function recordWebhook(eventId: string) {
      if (recordedEvents.has(eventId)) {
        throw new DuplicateEventError(eventId);
      }
      recordedEvents.add(eventId);
      return { status: "RECEIVED", eventId };
    }

    // First ingestion succeeds
    const first = recordWebhook("evt_01JABCDEF123456");
    expect(first.status).toBe("RECEIVED");

    // Second duplicate ingestion triggers duplicate event exception
    expect(() => recordWebhook("evt_01JABCDEF123456")).toThrowError(
      DuplicateEventError
    );
  });

  it("should enforce uniqueness on refund idempotency keys", () => {
    const idempotencyStore = new Map<string, { status: string; refundId: string }>();

    function processRefund(idempotencyKey: string, refundId: string) {
      if (idempotencyStore.has(idempotencyKey)) {
        // Return existing cached refund task result rather than recreating
        return { isNew: false, data: idempotencyStore.get(idempotencyKey)! };
      }
      const data = { status: "PROCESSING", refundId };
      idempotencyStore.set(idempotencyKey, data);
      return { isNew: true, data };
    }

    const key = "idem_key_uuid_890";
    const res1 = processRefund(key, "rfnd_test_123");
    expect(res1.isNew).toBe(true);

    const res2 = processRefund(key, "rfnd_test_456");
    expect(res2.isNew).toBe(false);
    expect(res2.data.refundId).toBe("rfnd_test_123");
  });
});
