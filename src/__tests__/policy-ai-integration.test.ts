import { describe, it, expect } from "vitest";
import { CaseStatus, AttemptChannel } from "@prisma/client";
import { evaluateRecoveryPolicy } from "../lib/policy/engine";
import { PolicyEvaluationInput } from "../lib/policy/types";
import { PersistedAiDiagnosis } from "../lib/ai/taxonomy";

describe("Policy Engine & AI Advisory Integration (Precedence & Invariants)", () => {
  const basePolicy = {
    policyId: "pol_test_01",
    policyVersion: 1,
    isActive: true,
    maxAttempts: 3,
    coolingPeriodMinutes: 30,
    linkExpiryMinutes: 1440,
    supportedCurrencies: ["INR"],
    allowedChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
    autoRefundEnabled: false,
    maxAmountMinor: BigInt(5000000), // 50,000 INR
  };

  const createValidAiDiagnosis = (
    recommendedHandling: "RETRY_CANDIDATE" | "REQUEST_ALTERNATE_METHOD" | "MANUAL_REVIEW" | "STOP",
    confidence: number = 0.95,
    reasonClass: import("../lib/ai/taxonomy").ReasonClass = "INSUFFICIENT_FUNDS"
  ): PersistedAiDiagnosis => ({
    model: "gemini-1.5-flash",
    promptVersion: "diagnosis-v1.0.0",
    structuredOutput: {
      reasonClass,
      confidence,
      summary: "Diagnostic classification summary",
      evidence: ["Observed failure code"],
      recommendedHandling,
      uncertainties: [],
    },
    validationStatus: "VALID",
    evaluatedAt: new Date().toISOString(),
  });

  it("allows recovery action when AI recommends RETRY_CANDIDATE with high confidence and merchant policy passes", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_01",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(250000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.92),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("ALLOW_ACTION");
    expect(decision.canExecute).toBe(true);
    expect(decision.aiAdvisoryAlignment?.isOverriddenByPolicy).toBe(false);
  });

  it("INVARIANT: AI recommending RETRY_CANDIDATE cannot override policy MAX_ATTEMPTS_EXCEEDED stopping rule", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_02",
      caseStatus: CaseStatus.IN_PROGRESS,
      caseVersion: 3,
      amountMinor: BigInt(250000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [
        { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "FAILED", createdAt: new Date(Date.now() - 3600000) },
        { attemptNumber: 2, channel: AttemptChannel.PAYMENT_LINK, status: "FAILED", createdAt: new Date(Date.now() - 2400000) },
        { attemptNumber: 3, channel: AttemptChannel.EMAIL, status: "FAILED", createdAt: new Date(Date.now() - 1200000) },
      ],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      // AI strongly suggests retry, but max attempts (3) is reached
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.99),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("STOP");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("MAX_ATTEMPTS_EXCEEDED");
    expect(decision.aiAdvisoryAlignment?.isOverriddenByPolicy).toBe(true);
    expect(decision.aiAdvisoryAlignment?.overrideReason).toContain("Maximum allowed recovery attempts");
  });

  it("INVARIANT: AI recommending RETRY_CANDIDATE cannot override active COOLDOWN_PERIOD", () => {
    const lastAttemptTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago (cooling period is 30 mins)
    const input: PolicyEvaluationInput = {
      caseId: "case_03",
      caseStatus: CaseStatus.IN_PROGRESS,
      caseVersion: 2,
      amountMinor: BigInt(150000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [
        { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "FAILED", createdAt: lastAttemptTime },
      ],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.95),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("STOP");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("COOLDOWN_PERIOD_ACTIVE");
    expect(decision.aiAdvisoryAlignment?.isOverriddenByPolicy).toBe(true);
  });

  it("INVARIANT: AI recommending action cannot override CUSTOMER_DO_NOT_CONTACT opt-out", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_04",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(150000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: true, // Customer opted out
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.98),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("STOP");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("CUSTOMER_DO_NOT_CONTACT");
    expect(decision.aiAdvisoryAlignment?.isOverriddenByPolicy).toBe(true);
  });

  it("INVARIANT: AI recommending action cannot override HIGH_VALUE_AMOUNT_CAP_EXCEEDED", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_05",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(10000000), // 100,000 INR (exceeds 50,000 cap)
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.95),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("HIGH_VALUE_AMOUNT_CAP_EXCEEDED");
    expect(decision.aiAdvisoryAlignment?.isOverriddenByPolicy).toBe(true);
  });

  it("enforces STOP when AI recommends STOP for SUSPECTED_FRAUD", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_06",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(250000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("STOP", 0.96, "SUSPECTED_FRAUD"),
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("STOP");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("DIAGNOSIS_STOP_RECOMMENDED");
  });

  it("routes to MANUAL_REVIEW when AI diagnosis validation failed or timed out", () => {
    const failedAiDiagnosis: PersistedAiDiagnosis = {
      model: "gemini-1.5-flash",
      promptVersion: "diagnosis-v1.0.0",
      structuredOutput: {
        reasonClass: "UNKNOWN_AMBIGUITY",
        confidence: 0,
        summary: "Model failed",
        evidence: ["Error occurred"],
        recommendedHandling: "MANUAL_REVIEW",
        uncertainties: ["Model unavailable"],
      },
      validationStatus: "TIMEOUT",
      evaluatedAt: new Date().toISOString(),
    };

    const input: PolicyEvaluationInput = {
      caseId: "case_07",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(250000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: failedAiDiagnosis,
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("AI_DIAGNOSIS_UNAVAILABLE");
  });

  it("routes to MANUAL_REVIEW when AI diagnosis confidence is below 70% threshold", () => {
    const input: PolicyEvaluationInput = {
      caseId: "case_08",
      caseStatus: CaseStatus.DETECTED,
      caseVersion: 1,
      amountMinor: BigInt(250000),
      currency: "INR",
      merchantPolicy: basePolicy,
      pastAttempts: [],
      currentTime: new Date(),
      isDoNotContact: false,
      hasCustomerContact: true,
      hasOrderOrPaymentRef: true,
      duplicateRiskDetected: false,
      aiDiagnosis: createValidAiDiagnosis("RETRY_CANDIDATE", 0.55), // Low confidence (55%)
    };

    const decision = evaluateRecoveryPolicy(input);
    expect(decision.outcome).toBe("MANUAL_REVIEW");
    expect(decision.canExecute).toBe(false);
    expect(decision.reasons).toContain("LOW_CONFIDENCE_DIAGNOSIS");
  });
});
