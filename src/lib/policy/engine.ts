import { CaseStatus, AttemptChannel } from "@prisma/client";
import { PolicyEvaluationInput, PolicyDecision } from "./types";

const MINIMUM_CONFIDENCE_THRESHOLD = 0.70;

/**
 * Pure deterministic policy evaluation function.
 * Enforces hard merchant stopping rules and returns machine-readable decisions.
 * Complete information is required; default on ambiguity is MANUAL_REVIEW or STOP.
 * 
 * INVARIANT: AI recommendations are strictly advisory. The merchant policy engine
 * retains final, unilateral authority and can override AI suggestions at any step.
 */
export function evaluateRecoveryPolicy(input: PolicyEvaluationInput): PolicyDecision {
  const reasons: string[] = [];
  const evaluatedAt = new Date(input.currentTime);
  const policyVersionStr = `v${input.merchantPolicy.policyVersion}`;

  const remainingAttempts = Math.max(
    0,
    input.merchantPolicy.maxAttempts - input.pastAttempts.length
  );

  // Extract structured AI diagnosis if provided
  const aiDiag = input.aiDiagnosis?.structuredOutput;
  const aiValidationStatus = input.aiDiagnosis?.validationStatus;
  const aiRecommendedHandling = aiDiag?.recommendedHandling || input.diagnosis?.recommendedHandling;
  const aiConfidence = aiDiag?.confidence ?? input.diagnosis?.confidence;

  const makeDecision = (
    outcome: PolicyDecision["outcome"],
    specificReasons: string[],
    stoppingRule: string,
    canExecute: boolean,
    allowedChannels: AttemptChannel[] = []
  ): PolicyDecision => {
    const isOverridden =
      (aiRecommendedHandling === "RETRY_CANDIDATE" || aiRecommendedHandling === "REQUEST_ALTERNATE_METHOD") &&
      outcome !== "ALLOW_ACTION";

    return {
      outcome,
      reasons: specificReasons,
      allowedActionTypes: allowedChannels,
      remainingAttempts,
      nextStoppingRule: stoppingRule,
      policyVersion: policyVersionStr,
      evaluatedAt,
      canExecute,
      aiAdvisoryAlignment: aiRecommendedHandling
        ? {
            aiRecommendedHandling,
            aiConfidence,
            isOverriddenByPolicy: isOverridden,
            overrideReason: isOverridden ? stoppingRule : undefined,
          }
        : undefined,
    };
  };

  // 1. Merchant Policy Active Check
  if (!input.merchantPolicy.isActive) {
    return makeDecision(
      "STOP",
      ["POLICY_INACTIVE"],
      "Merchant recovery policy is currently inactive.",
      false
    );
  }

  // 2. Policy Version Mismatch / Stale Check
  if (
    input.expectedPolicyVersion !== undefined &&
    input.expectedPolicyVersion !== input.merchantPolicy.policyVersion
  ) {
    return makeDecision(
      "MANUAL_REVIEW",
      ["STALE_POLICY_VERSION"],
      `Policy version mismatch: expected v${input.expectedPolicyVersion} but active is v${input.merchantPolicy.policyVersion}.`,
      false
    );
  }

  // 3. Terminal Case State Check
  const terminalStatuses = new Set<CaseStatus>([
    CaseStatus.RECOVERED,
    CaseStatus.CLOSED,
    CaseStatus.FAILED,
    CaseStatus.EXPIRED,
  ]);

  if (terminalStatuses.has(input.caseStatus)) {
    return makeDecision(
      "STOP",
      [`TERMINAL_CASE_STATE_${input.caseStatus}`],
      `Case is in terminal state "${input.caseStatus}". No further recovery actions allowed.`,
      false
    );
  }

  // 4. Do-Not-Contact / Customer Opt-Out Check
  if (input.isDoNotContact) {
    return makeDecision(
      "STOP",
      ["CUSTOMER_DO_NOT_CONTACT"],
      "Customer has opted out of automated communications or is marked Do-Not-Contact.",
      false
    );
  }

  // 5. Missing Essential Identifiers
  if (!input.hasCustomerContact) {
    return makeDecision(
      "STOP",
      ["MISSING_CUSTOMER_CONTACT"],
      "Missing customer contact info (email or phone) required for recovery delivery.",
      false
    );
  }

  if (!input.hasOrderOrPaymentRef) {
    return makeDecision(
      "STOP",
      ["MISSING_TRANSACTION_IDENTIFIERS"],
      "Missing original payment or order reference ID.",
      false
    );
  }

  // 6. AI Diagnosis & Failure Classification Evaluation
  const effectiveDiagnosis = input.diagnosis;

  if (!effectiveDiagnosis && !input.aiDiagnosis) {
    return makeDecision(
      "MANUAL_REVIEW",
      ["MISSING_DIAGNOSIS"],
      "No diagnostic classification attached to failure; manual review required.",
      false
    );
  }

  // If AI diagnosis failed validation or encountered error/timeout, fail closed to MANUAL_REVIEW
  if (aiValidationStatus && aiValidationStatus !== "VALID") {
    return makeDecision(
      "MANUAL_REVIEW",
      ["AI_DIAGNOSIS_UNAVAILABLE", `AI_STATUS_${aiValidationStatus}`],
      `AI diagnostic service failed (${aiValidationStatus}); safe routing to manual review.`,
      false
    );
  }

  // Check structured recommendedHandling if present
  if (aiRecommendedHandling === "STOP") {
    const reasonClass = aiDiag?.reasonClass || effectiveDiagnosis?.category || "UNSPECIFIED";
    return makeDecision(
      "STOP",
      ["DIAGNOSIS_STOP_RECOMMENDED", `CATEGORY_${reasonClass}`],
      `Diagnostic classification advised STOP for category ${reasonClass}.`,
      false
    );
  }

  if (aiRecommendedHandling === "MANUAL_REVIEW") {
    return makeDecision(
      "MANUAL_REVIEW",
      ["DIAGNOSIS_MANUAL_REVIEW_RECOMMENDED"],
      "Diagnostic model identified high ambiguity or risk; manual review recommended.",
      false
    );
  }

  // Check isRecoverable flag
  const isRecoverable = effectiveDiagnosis
    ? effectiveDiagnosis.isRecoverable
    : aiDiag?.reasonClass !== "SUSPECTED_FRAUD" && aiDiag?.reasonClass !== "UNKNOWN_AMBIGUITY";

  if (!isRecoverable) {
    const category = effectiveDiagnosis?.category || aiDiag?.reasonClass || "UNKNOWN";
    return makeDecision(
      "STOP",
      ["DIAGNOSIS_UNRECOVERABLE", `CATEGORY_${category}`],
      `Failure categorized as non-recoverable (${category}).`,
      false
    );
  }

  const confidence = aiDiag?.confidence ?? effectiveDiagnosis?.confidence ?? 0;
  if (confidence < MINIMUM_CONFIDENCE_THRESHOLD) {
    return makeDecision(
      "MANUAL_REVIEW",
      [
        "LOW_CONFIDENCE_DIAGNOSIS",
        `CONFIDENCE_${Math.round(confidence * 100)}PCT`,
      ],
      `Diagnosis confidence (${(confidence * 100).toFixed(1)}%) is below required threshold (${(MINIMUM_CONFIDENCE_THRESHOLD * 100).toFixed(0)}%).`,
      false
    );
  }

  // 7. Duplicate Risk Detection
  if (input.duplicateRiskDetected) {
    return makeDecision(
      "MANUAL_REVIEW",
      ["DUPLICATE_PAYMENT_RISK"],
      "Potential duplicate payment or parallel active checkout session detected.",
      false
    );
  }

  // 8. Currency & Amount Boundaries
  const currencyUpper = input.currency.toUpperCase();
  if (
    input.merchantPolicy.supportedCurrencies.length > 0 &&
    !input.merchantPolicy.supportedCurrencies.includes(currencyUpper)
  ) {
    return makeDecision(
      "MANUAL_REVIEW",
      ["UNSUPPORTED_CURRENCY", `CURRENCY_${currencyUpper}`],
      `Currency ${currencyUpper} is not in merchant supported currencies list.`,
      false
    );
  }

  if (
    input.merchantPolicy.minAmountMinor !== undefined &&
    input.amountMinor < input.merchantPolicy.minAmountMinor
  ) {
    return makeDecision(
      "STOP",
      ["AMOUNT_BELOW_MINIMUM_THRESHOLD"],
      `Transaction amount (${input.amountMinor}) is below policy minimum threshold (${input.merchantPolicy.minAmountMinor}).`,
      false
    );
  }

  if (
    input.merchantPolicy.maxAmountMinor !== undefined &&
    input.amountMinor > input.merchantPolicy.maxAmountMinor
  ) {
    return makeDecision(
      "MANUAL_REVIEW",
      ["HIGH_VALUE_AMOUNT_CAP_EXCEEDED"],
      `High-value amount (${input.amountMinor}) exceeds policy maximum limit (${input.merchantPolicy.maxAmountMinor}); operator authorization required.`,
      false
    );
  }

  // 9. Max Attempts Reached
  if (input.pastAttempts.length >= input.merchantPolicy.maxAttempts) {
    return makeDecision(
      "STOP",
      ["MAX_ATTEMPTS_EXCEEDED"],
      `Maximum allowed recovery attempts (${input.merchantPolicy.maxAttempts}) reached.`,
      false
    );
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
        return makeDecision(
          "STOP",
          ["COOLDOWN_PERIOD_ACTIVE", `REMAINING_${remainingCooldownMinutes}M`],
          `Cooling-off period active. Next attempt eligible in ${remainingCooldownMinutes} minute(s).`,
          false
        );
      }
    }
  }

  // 11. All Stopping Rules Passed -> ALLOW_ACTION
  const allowedChannels = input.merchantPolicy.allowedChannels.length > 0
    ? input.merchantPolicy.allowedChannels
    : [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL];

  reasons.push("POLICY_RULES_SATISFIED");

  return makeDecision(
    "ALLOW_ACTION",
    reasons,
    remainingAttempts > 1
      ? `After next attempt, cooling period will be ${input.merchantPolicy.coolingPeriodMinutes} minutes.`
      : "Next attempt is the final allowed recovery attempt.",
    true,
    allowedChannels
  );
}

