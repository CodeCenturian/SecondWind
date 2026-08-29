import { describe, it, expect } from "vitest";
import { evaluateRecoveryPolicy } from "../lib/policy/engine";
import { PolicyEvaluationInput, MerchantPolicyRules } from "../lib/policy/types";
import { CaseStatus, AttemptChannel } from "@prisma/client";

describe("Deterministic Merchant Policy Engine - Table Driven Tests", () => {
  const basePolicy: MerchantPolicyRules = {
    policyId: "pol_test_123",
    policyVersion: 1,
    isActive: true,
    maxAttempts: 3,
    coolingPeriodMinutes: 30,
    linkExpiryMinutes: 1440,
    minAmountMinor: 100n, // ₹1.00 min
    maxAmountMinor: 1000000n, // ₹10,000.00 max
    supportedCurrencies: ["INR", "USD"],
    allowedChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
    autoRefundEnabled: false,
  };

  const defaultValidInput: PolicyEvaluationInput = {
    caseId: "case_01",
    caseStatus: CaseStatus.DETECTED,
    caseVersion: 1,
    amountMinor: 50000n, // ₹500.00
    currency: "INR",
    merchantPolicy: basePolicy,
    pastAttempts: [],
    currentTime: new Date("2026-08-29T12:00:00Z"),
    isDoNotContact: false,
    diagnosis: {
      category: "INSUFFICIENT_FUNDS",
      confidence: 0.95,
      isRecoverable: true,
      explanation: "Customer card limit exceeded",
    },
    duplicateRiskDetected: false,
    hasCustomerContact: true,
    hasOrderOrPaymentRef: true,
    expectedPolicyVersion: 1,
  };

  it("1. Standard valid input produces ALLOW_ACTION with remaining attempts", () => {
    const decision = evaluateRecoveryPolicy(defaultValidInput);
    expect(decision.outcome).toBe("ALLOW_ACTION");
    expect(decision.canExecute).toBe(true);
    expect(decision.remainingAttempts).toBe(3);
    expect(decision.allowedActionTypes).toEqual([AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL]);
    expect(decision.reasons).toContain("POLICY_RULES_SATISFIED");
  });

  // Table of Stopping Rule Test Cases
  const stoppingRuleScenarios: Array<{
    name: string;
    override: Partial<PolicyEvaluationInput>;
    expectedOutcome: "STOP" | "MANUAL_REVIEW";
    expectedReason: string;
  }> = [
    {
      name: "Inactive Merchant Policy",
      override: {
        merchantPolicy: { ...basePolicy, isActive: false },
      },
      expectedOutcome: "STOP",
      expectedReason: "POLICY_INACTIVE",
    },
    {
      name: "Policy Version Mismatch / Stale Version",
      override: {
        expectedPolicyVersion: 2, // policy active is v1
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "STALE_POLICY_VERSION",
    },
    {
      name: "Terminal Case State: RECOVERED",
      override: {
        caseStatus: CaseStatus.RECOVERED,
      },
      expectedOutcome: "STOP",
      expectedReason: "TERMINAL_CASE_STATE_RECOVERED",
    },
    {
      name: "Terminal Case State: CLOSED",
      override: {
        caseStatus: CaseStatus.CLOSED,
      },
      expectedOutcome: "STOP",
      expectedReason: "TERMINAL_CASE_STATE_CLOSED",
    },
    {
      name: "Customer Do-Not-Contact Flag Active",
      override: {
        isDoNotContact: true,
      },
      expectedOutcome: "STOP",
      expectedReason: "CUSTOMER_DO_NOT_CONTACT",
    },
    {
      name: "Missing Customer Contact Info",
      override: {
        hasCustomerContact: false,
      },
      expectedOutcome: "STOP",
      expectedReason: "MISSING_CUSTOMER_CONTACT",
    },
    {
      name: "Missing Order/Payment Identifier",
      override: {
        hasOrderOrPaymentRef: false,
      },
      expectedOutcome: "STOP",
      expectedReason: "MISSING_TRANSACTION_IDENTIFIERS",
    },
    {
      name: "Missing Diagnosis (Incomplete Information)",
      override: {
        diagnosis: null,
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "MISSING_DIAGNOSIS",
    },
    {
      name: "Unrecoverable Diagnosis (Suspected Fraud / Permanent Block)",
      override: {
        diagnosis: {
          category: "FRAUD_BLOCK",
          confidence: 0.99,
          isRecoverable: false,
        },
      },
      expectedOutcome: "STOP",
      expectedReason: "DIAGNOSIS_UNRECOVERABLE",
    },
    {
      name: "Low Confidence Diagnosis (< 70%)",
      override: {
        diagnosis: {
          category: "UNKNOWN_NETWORK_ERROR",
          confidence: 0.55,
          isRecoverable: true,
        },
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "LOW_CONFIDENCE_DIAGNOSIS",
    },
    {
      name: "Duplicate Payment Risk Detected",
      override: {
        duplicateRiskDetected: true,
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "DUPLICATE_PAYMENT_RISK",
    },
    {
      name: "Unsupported Currency",
      override: {
        currency: "JPY",
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "UNSUPPORTED_CURRENCY",
    },
    {
      name: "Amount Below Minimum Policy Threshold",
      override: {
        amountMinor: 50n, // < 100n
      },
      expectedOutcome: "STOP",
      expectedReason: "AMOUNT_BELOW_MINIMUM_THRESHOLD",
    },
    {
      name: "High Value Amount Exceeds Policy Max Cap",
      override: {
        amountMinor: 2500000n, // ₹25,000.00 > ₹10,000.00 max
      },
      expectedOutcome: "MANUAL_REVIEW",
      expectedReason: "HIGH_VALUE_AMOUNT_CAP_EXCEEDED",
    },
    {
      name: "Max Attempts Exceeded (3/3 used)",
      override: {
        pastAttempts: [
          { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "SENT", createdAt: new Date("2026-08-29T10:00:00Z") },
          { attemptNumber: 2, channel: AttemptChannel.EMAIL, status: "SENT", createdAt: new Date("2026-08-29T10:45:00Z") },
          { attemptNumber: 3, channel: AttemptChannel.PAYMENT_LINK, status: "FAILED", createdAt: new Date("2026-08-29T11:20:00Z") },
        ],
      },
      expectedOutcome: "STOP",
      expectedReason: "MAX_ATTEMPTS_EXCEEDED",
    },
    {
      name: "Cooldown Period Active (15 mins elapsed < 30 mins required)",
      override: {
        currentTime: new Date("2026-08-29T12:15:00Z"),
        pastAttempts: [
          { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "SENT", createdAt: new Date("2026-08-29T12:00:00Z") },
        ],
      },
      expectedOutcome: "STOP",
      expectedReason: "COOLDOWN_PERIOD_ACTIVE",
    },
  ];

  for (const scenario of stoppingRuleScenarios) {
    it(`Stopping Rule: ${scenario.name} -> ${scenario.expectedOutcome}`, () => {
      const input: PolicyEvaluationInput = {
        ...defaultValidInput,
        ...scenario.override,
      };

      const decision = evaluateRecoveryPolicy(input);
      expect(decision.outcome).toBe(scenario.expectedOutcome);
      expect(decision.canExecute).toBe(false);
      expect(decision.reasons).toContain(scenario.expectedReason);
      expect(decision.allowedActionTypes).toHaveLength(0);
    });
  }

  it("Cooldown period elapsed allows next action", () => {
    const elapsedInput: PolicyEvaluationInput = {
      ...defaultValidInput,
      currentTime: new Date("2026-08-29T12:35:00Z"), // 35 mins elapsed > 30 mins cooldown
      pastAttempts: [
        { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "SENT", createdAt: new Date("2026-08-29T12:00:00Z") },
      ],
    };

    const decision = evaluateRecoveryPolicy(elapsedInput);
    expect(decision.outcome).toBe("ALLOW_ACTION");
    expect(decision.canExecute).toBe(true);
    expect(decision.remainingAttempts).toBe(2);
  });
});
