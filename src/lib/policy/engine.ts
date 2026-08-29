import { CaseStatus, AttemptChannel } from "@prisma/client";
import { PolicyEvaluationInput, PolicyDecision } from "./types";

const MINIMUM_CONFIDENCE_THRESHOLD = 0.70;

/**
 * Pure deterministic policy evaluation function.
 * Enforces hard merchant stopping rules and returns machine-readable decisions.
 * Complete information is required; default on ambiguity is MANUAL_REVIEW or STOP.
 */
export function evaluateRecoveryPolicy(input: PolicyEvaluationInput): PolicyDecision {
  const reasons: string[] = [];
  const evaluatedAt = new Date(input.currentTime);
  const policyVersionStr = `v${input.merchantPolicy.policyVersion}`;

  const remainingAttempts = Math.max(
    0,
    input.merchantPolicy.maxAttempts - input.pastAttempts.length
  );

  // 1. Merchant Policy Active Check
  if (!input.merchantPolicy.isActive) {
    return {
      outcome: "STOP",
      reasons: ["POLICY_INACTIVE"],
      allowedActionTypes: [],
      remainingAttempts: 0,
      nextStoppingRule: "Merchant recovery policy is currently inactive.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 2. Policy Version Mismatch / Stale Check
  if (
    input.expectedPolicyVersion !== undefined &&
    input.expectedPolicyVersion !== input.merchantPolicy.policyVersion
  ) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: ["STALE_POLICY_VERSION"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: `Policy version mismatch: expected v${input.expectedPolicyVersion} but active is v${input.merchantPolicy.policyVersion}.`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 3. Terminal Case State Check
  const terminalStatuses = new Set<CaseStatus>([
    CaseStatus.RECOVERED,
    CaseStatus.CLOSED,
    CaseStatus.FAILED,
    CaseStatus.EXPIRED,
  ]);

  if (terminalStatuses.has(input.caseStatus)) {
    return {
      outcome: "STOP",
      reasons: [`TERMINAL_CASE_STATE_${input.caseStatus}`],
      allowedActionTypes: [],
      remainingAttempts: 0,
      nextStoppingRule: `Case is in terminal state "${input.caseStatus}". No further recovery actions allowed.`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 4. Do-Not-Contact / Customer Opt-Out Check
  if (input.isDoNotContact) {
    return {
      outcome: "STOP",
      reasons: ["CUSTOMER_DO_NOT_CONTACT"],
      allowedActionTypes: [],
      remainingAttempts: 0,
      nextStoppingRule: "Customer has opted out of automated communications or is marked Do-Not-Contact.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 5. Missing Essential Identifiers
  if (!input.hasCustomerContact) {
    return {
      outcome: "STOP",
      reasons: ["MISSING_CUSTOMER_CONTACT"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: "Missing customer contact info (email or phone) required for recovery delivery.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  if (!input.hasOrderOrPaymentRef) {
    return {
      outcome: "STOP",
      reasons: ["MISSING_TRANSACTION_IDENTIFIERS"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: "Missing original payment or order reference ID.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 6. Diagnosis Evaluation (Confidence & Recoverability)
  if (!input.diagnosis) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: ["MISSING_DIAGNOSIS"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: "No diagnostic classification attached to failure; manual review required.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  if (!input.diagnosis.isRecoverable) {
    return {
      outcome: "STOP",
      reasons: ["DIAGNOSIS_UNRECOVERABLE", `CATEGORY_${input.diagnosis.category}`],
      allowedActionTypes: [],
      remainingAttempts: 0,
      nextStoppingRule: `Failure categorized as non-recoverable (${input.diagnosis.category}).`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  if (input.diagnosis.confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: [
        "LOW_CONFIDENCE_DIAGNOSIS",
        `CONFIDENCE_${Math.round(input.diagnosis.confidence * 100)}PCT`,
      ],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: `Diagnosis confidence (${(input.diagnosis.confidence * 100).toFixed(1)}%) is below required threshold (${(MINIMUM_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%).`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 7. Duplicate Risk Detection
  if (input.duplicateRiskDetected) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: ["DUPLICATE_PAYMENT_RISK"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: "Potential duplicate payment or parallel active checkout session detected.",
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 8. Currency & Amount Boundaries
  const currencyUpper = input.currency.toUpperCase();
  if (
    input.merchantPolicy.supportedCurrencies.length > 0 &&
    !input.merchantPolicy.supportedCurrencies.includes(currencyUpper)
  ) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: ["UNSUPPORTED_CURRENCY", `CURRENCY_${currencyUpper}`],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: `Currency ${currencyUpper} is not in merchant supported currencies list.`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  if (
    input.merchantPolicy.minAmountMinor !== undefined &&
    input.amountMinor < input.merchantPolicy.minAmountMinor
  ) {
    return {
      outcome: "STOP",
      reasons: ["AMOUNT_BELOW_MINIMUM_THRESHOLD"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: `Transaction amount (${input.amountMinor}) is below policy minimum threshold (${input.merchantPolicy.minAmountMinor}).`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  if (
    input.merchantPolicy.maxAmountMinor !== undefined &&
    input.amountMinor > input.merchantPolicy.maxAmountMinor
  ) {
    return {
      outcome: "MANUAL_REVIEW",
      reasons: ["HIGH_VALUE_AMOUNT_CAP_EXCEEDED"],
      allowedActionTypes: [],
      remainingAttempts,
      nextStoppingRule: `High-value amount (${input.amountMinor}) exceeds policy maximum limit (${input.merchantPolicy.maxAmountMinor}); operator authorization required.`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 9. Max Attempts Reached
  if (input.pastAttempts.length >= input.merchantPolicy.maxAttempts) {
    return {
      outcome: "STOP",
      reasons: ["MAX_ATTEMPTS_EXCEEDED"],
      allowedActionTypes: [],
      remainingAttempts: 0,
      nextStoppingRule: `Maximum allowed recovery attempts (${input.merchantPolicy.maxAttempts}) reached.`,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute: false,
    };
  }

  // 10. Cooldown Period Check
  if (input.pastAttempts.length > 0) {
    const sortedAttempts = [...input.pastAttempts].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastAttempt = sortedAttempts[0];
    if (lastAttempt) {
      const elapsedMs = input.currentTime.getTime() - new Date(lastAttempt.createdAt).getTime();
      const requiredCooldownMs = input.merchantPolicy.coolingPeriodMinutes * 60 * 1000;

      if (elapsedMs < requiredCooldownMs) {
        const remainingCooldownMinutes = Math.ceil((requiredCooldownMs - elapsedMs) / 60000);
        return {
          outcome: "STOP",
          reasons: ["COOLDOWN_PERIOD_ACTIVE", `REMAINING_${remainingCooldownMinutes}M`],
          allowedActionTypes: [],
          remainingAttempts,
          nextStoppingRule: `Cooling-off period active. Next attempt eligible in ${remainingCooldownMinutes} minute(s).`,
          policyVersion: policyVersionStr,
          evaluatedAt,
          canExecute: false,
        };
      }
    }
  }

  // 11. All Stopping Rules Passed -> ALLOW_ACTION
  const allowedChannels = input.merchantPolicy.allowedChannels.length > 0
    ? input.merchantPolicy.allowedChannels
    : [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL];

  reasons.push("POLICY_RULES_SATISFIED");

  return {
    outcome: "ALLOW_ACTION",
    reasons,
    allowedActionTypes: allowedChannels,
    remainingAttempts,
    nextStoppingRule: remainingAttempts > 1
      ? `After next attempt, cooling period will be ${input.merchantPolicy.coolingPeriodMinutes} minutes.`
      : "Next attempt is the final allowed recovery attempt.",
    policyVersion: policyVersionStr,
    evaluatedAt,
    canExecute: true,
  };
}
