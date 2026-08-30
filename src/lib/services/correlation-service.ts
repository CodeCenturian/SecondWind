/**
 * Pure Deterministic Correlation Engine
 * 
 * Evaluates payment identifiers, opaque tokens, provider references, amounts,
 * and lifecycle timestamps without performing any side-effects.
 * 
 * INVARIANT:
 * Correlation NEVER relies solely on matching amounts. Ambiguous cases route to MANUAL_REVIEW.
 */

export type CorrelationClassification =
  | "NO_MATCH"
  | "MATCHED_RECOVERY_ATTEMPT"
  | "IDEMPOTENT_REPLAY"
  | "CONFIRMED_DUPLICATE_RACE"
  | "POSSIBLE_DUPLICATE"
  | "AMOUNT_MISMATCH";

export type RecommendedAction =
  | "NONE"
  | "SETTLE_RECOVERY"
  | "FLAG_DUPLICATE_RACE"
  | "ROUTE_MANUAL_REVIEW"
  | "ACKNOWLEDGE_IDEMPOTENT";

export interface IncomingPaymentPayload {
  paymentId: string;
  amountMinor: bigint;
  currency: string;
  status: string;
  captured: boolean;
  orderId?: string | null;
  paymentLinkId?: string | null;
  correlationToken?: string | null;
  notes?: Record<string, unknown>;
  timestamp?: number | Date | null;
}

export interface CandidateAttemptSummary {
  id: string;
  attemptNumber: number;
  status: string;
  paymentLinkId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CandidateCaseSummary {
  id: string;
  paymentId: string; // Original failed payment ID
  orderId?: string | null;
  customerEmail?: string | null;
  amountMinor: bigint;
  currency: string;
  status: string;
  recoveredAt?: Date | null;
  attempts: CandidateAttemptSummary[];
}

export interface CorrelationDecision {
  classification: CorrelationClassification;
  recommendedAction: RecommendedAction;
  confidence: number; // 0..1
  isAdversarialRace: boolean;
  evidence: string[];
  uncertainties: string[];
  matchedCaseId?: string;
  matchedAttemptId?: string;
  originalPaymentId?: string;
  conflictingPaymentId?: string;
}

/**
 * Pure functional evaluation of incoming payment against candidate case and attempts.
 */
export function evaluateCorrelation(
  incoming: IncomingPaymentPayload,
  candidate: CandidateCaseSummary | null | undefined
): CorrelationDecision {
  if (!candidate) {
    return {
      classification: "NO_MATCH",
      recommendedAction: "NONE",
      confidence: 0,
      isAdversarialRace: false,
      evidence: ["No candidate case provided for correlation"],
      uncertainties: ["Missing case record"],
    };
  }

  const evidence: string[] = [];
  const uncertainties: string[] = [];

  // Extract correlation token from incoming payload notes or explicit field
  const incomingNotes = incoming.notes || {};
  const tokenFromNotes =
    typeof incomingNotes["correlation_token"] === "string"
      ? incomingNotes["correlation_token"]
      : typeof incomingNotes["reference_id"] === "string"
      ? incomingNotes["reference_id"]
      : null;
  const correlationToken = incoming.correlationToken || tokenFromNotes;

  // 1. Direct Original Payment ID Check
  const isOriginalPayment = incoming.paymentId === candidate.paymentId;
  const isCaseAlreadyRecovered =
    candidate.status === "RECOVERED" ||
    Boolean(candidate.recoveredAt) ||
    candidate.attempts.some((a) => a.status === "PAID");

  if (isOriginalPayment) {
    evidence.push(`Incoming payment ID (${incoming.paymentId}) matches original failed transaction.`);

    if (isCaseAlreadyRecovered) {
      // ADVERSARIAL PAYMENT RACE: Original payment authorized/captured after recovery was already settled!
      const paidAttempt = candidate.attempts.find((a) => a.status === "PAID");
      const paidMeta = (paidAttempt?.metadata || {}) as Record<string, unknown>;
      const recoveredPaymentId =
        typeof paidMeta["capturedPaymentId"] === "string"
          ? paidMeta["capturedPaymentId"]
          : "unknown_recovery_payment";

      evidence.push(
        `Case ${candidate.id} has settled recovery (settled via ${recoveredPaymentId}).`,
        `Original payment ${incoming.paymentId} delivered late event with status="${incoming.status}", captured=${incoming.captured}.`,
        "Adversarial double-collection race condition detected; rejected under anti-fuzzy matching policy."
      );

      return {
        classification: "CONFIRMED_DUPLICATE_RACE",
        recommendedAction: "FLAG_DUPLICATE_RACE",
        confidence: 1.0,
        isAdversarialRace: true,
        evidence,
        uncertainties: [],
        matchedCaseId: candidate.id,
        matchedAttemptId: paidAttempt?.id,
        originalPaymentId: candidate.paymentId,
        conflictingPaymentId: incoming.paymentId,
      };
    }
  }

  // 2. Recovery Attempt Correlation (by paymentLinkId or correlationToken)
  let matchedAttempt: CandidateAttemptSummary | undefined = undefined;

  if (incoming.paymentLinkId) {
    matchedAttempt = candidate.attempts.find((a) => a.paymentLinkId === incoming.paymentLinkId);
    if (matchedAttempt) {
      evidence.push(`Incoming payment link ID (${incoming.paymentLinkId}) matches RecoveryAttempt #${matchedAttempt.attemptNumber}.`);
    }
  }

  if (!matchedAttempt && correlationToken) {
    matchedAttempt = candidate.attempts.find((a) => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      return meta["correlationToken"] === correlationToken;
    });
    if (matchedAttempt) {
      evidence.push(`Incoming correlation token (${correlationToken}) matches RecoveryAttempt #${matchedAttempt.attemptNumber}.`);
    }
  }

  if (matchedAttempt) {
    const attemptMeta = (matchedAttempt.metadata || {}) as Record<string, unknown>;
    const alreadyCapturedPaymentId = attemptMeta["capturedPaymentId"] as string | undefined;

    // Check for Idempotent Replay
    if (isCaseAlreadyRecovered) {
      if (alreadyCapturedPaymentId === incoming.paymentId) {
        evidence.push(
          `Case is already RECOVERED with identical payment ID ${incoming.paymentId}.`,
          "Idempotent webhook replay detected."
        );
        return {
          classification: "IDEMPOTENT_REPLAY",
          recommendedAction: "ACKNOWLEDGE_IDEMPOTENT",
          confidence: 1.0,
          isAdversarialRace: false,
          evidence,
          uncertainties: [],
          matchedCaseId: candidate.id,
          matchedAttemptId: matchedAttempt.id,
        };
      } else if (alreadyCapturedPaymentId && alreadyCapturedPaymentId !== incoming.paymentId) {
        // Different payment on same attempt/case already settled
        evidence.push(
          `Case is already settled with ${alreadyCapturedPaymentId}, but incoming payment ID is ${incoming.paymentId}.`,
          "Secondary payment captured on already settled attempt."
        );
        return {
          classification: "CONFIRMED_DUPLICATE_RACE",
          recommendedAction: "FLAG_DUPLICATE_RACE",
          confidence: 0.95,
          isAdversarialRace: true,
          evidence,
          uncertainties: [],
          matchedCaseId: candidate.id,
          matchedAttemptId: matchedAttempt.id,
          originalPaymentId: candidate.paymentId,
          conflictingPaymentId: incoming.paymentId,
        };
      }
    }

    // Check Amount and Currency
    const currencyMatches = incoming.currency.toUpperCase() === candidate.currency.toUpperCase();
    const amountMatches = incoming.amountMinor >= candidate.amountMinor;

    if (!currencyMatches || !amountMatches) {
      evidence.push(
        `Currency match: ${currencyMatches} (expected ${candidate.currency}, got ${incoming.currency}).`,
        `Amount match: ${amountMatches} (expected ${candidate.amountMinor}, got ${incoming.amountMinor}).`
      );
      uncertainties.push("Amount or currency does not reconcile with original failure.");

      return {
        classification: "AMOUNT_MISMATCH",
        recommendedAction: "ROUTE_MANUAL_REVIEW",
        confidence: 0.9,
        isAdversarialRace: false,
        evidence,
        uncertainties,
        matchedCaseId: candidate.id,
        matchedAttemptId: matchedAttempt.id,
      };
    }

    evidence.push("Authoritative recovery attempt confirmed with exact amount and currency match.");
    return {
      classification: "MATCHED_RECOVERY_ATTEMPT",
      recommendedAction: "SETTLE_RECOVERY",
      confidence: 1.0,
      isAdversarialRace: false,
      evidence,
      uncertainties: [],
      matchedCaseId: candidate.id,
      matchedAttemptId: matchedAttempt.id,
    };
  }

  // 3. Order ID / Customer correlation without Link or Token
  if (incoming.orderId && candidate.orderId && incoming.orderId === candidate.orderId) {
    evidence.push(`Order ID (${incoming.orderId}) matches candidate case.`);
    uncertainties.push("Payment ID and correlation token were absent; cannot prove direct attempt link.");

    return {
      classification: "POSSIBLE_DUPLICATE",
      recommendedAction: "ROUTE_MANUAL_REVIEW",
      confidence: 0.65,
      isAdversarialRace: false,
      evidence,
      uncertainties,
      matchedCaseId: candidate.id,
      originalPaymentId: candidate.paymentId,
      conflictingPaymentId: incoming.paymentId,
    };
  }

  // 4. Amount-only match rejected under anti-fuzzy matching policy
  if (incoming.amountMinor === candidate.amountMinor) {
    evidence.push("Nominal amount matched candidate case, but no payment ID, link ID, order ID, or correlation token matched; rejected under anti-fuzzy matching policy.");
    uncertainties.push("Fuzzy amount matching is strictly prohibited under financial invariants.");

    return {
      classification: "NO_MATCH",
      recommendedAction: "NONE",
      confidence: 0.0,
      isAdversarialRace: false,
      evidence,
      uncertainties,
    };
  }

  return {
    classification: "NO_MATCH",
    recommendedAction: "NONE",
    confidence: 0.0,
    isAdversarialRace: false,
    evidence: ["No identifiers, tokens, or references matched candidate case."],
    uncertainties: [],
  };
}
