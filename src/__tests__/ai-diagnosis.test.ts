import { describe, it, expect } from "vitest";
import {
  AiDiagnosisStructuredOutputSchema,
} from "../lib/ai/taxonomy";
import {
  redactSensitiveText,
  maskEmail,
  maskPhone,
  sanitizeDiagnosisInput,
} from "../lib/ai/redaction";
import { createSafeFallbackDiagnosis } from "../lib/ai/diagnosis";

describe("AI Diagnosis Schema & Closed Taxonomy Validation", () => {
  it("accepts valid structured output conforming strictly to taxonomy", () => {
    const validOutput = {
      reasonClass: "INSUFFICIENT_FUNDS",
      confidence: 0.94,
      summary: "Customer bank reported insufficient funds at the time of charge authorization.",
      evidence: [
        "Provider error code is BAD_REQUEST_ERROR with description 'Account has insufficient funds'",
        "No previous recovery attempt recorded",
      ],
      recommendedHandling: "RETRY_CANDIDATE",
      uncertainties: ["Customer replenishment timing is unknown"],
    };

    const result = AiDiagnosisStructuredOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reasonClass).toBe("INSUFFICIENT_FUNDS");
      expect(result.data.confidence).toBe(0.94);
      expect(result.data.recommendedHandling).toBe("RETRY_CANDIDATE");
    }
  });

  it("fails closed on out-of-taxonomy reasonClass", () => {
    const invalidOutput = {
      reasonClass: "RANDOM_UNAUTHORIZED_CLASS",
      confidence: 0.85,
      summary: "Some reason",
      evidence: ["Some evidence"],
      recommendedHandling: "RETRY_CANDIDATE",
      uncertainties: [],
    };

    const result = AiDiagnosisStructuredOutputSchema.safeParse(invalidOutput);
    expect(result.success).toBe(false);
  });

  it("fails closed on out-of-bounds confidence (< 0 or > 1)", () => {
    const overconfident = {
      reasonClass: "AUTHENTICATION_FAILED",
      confidence: 1.5, // Illegal: > 1.0
      summary: "OTP verification failed",
      evidence: ["User expired OTP"],
      recommendedHandling: "REQUEST_ALTERNATE_METHOD",
      uncertainties: [],
    };

    const underconfident = {
      reasonClass: "AUTHENTICATION_FAILED",
      confidence: -0.1, // Illegal: < 0.0
      summary: "OTP verification failed",
      evidence: ["User expired OTP"],
      recommendedHandling: "REQUEST_ALTERNATE_METHOD",
      uncertainties: [],
    };

    expect(AiDiagnosisStructuredOutputSchema.safeParse(overconfident).success).toBe(false);
    expect(AiDiagnosisStructuredOutputSchema.safeParse(underconfident).success).toBe(false);
  });

  it("fails closed on unrecognized recommendedHandling action", () => {
    const invalidAction = {
      reasonClass: "TEMPORARY_BANK_DOWNTIME",
      confidence: 0.88,
      summary: "Gateway timeout",
      evidence: ["Gateway timed out"],
      recommendedHandling: "INSTANTLY_EXECUTE_PAYMENT", // Illegal action
      uncertainties: [],
    };

    expect(AiDiagnosisStructuredOutputSchema.safeParse(invalidAction).success).toBe(false);
  });

  it("fails closed when model attempts to produce illegal financial or execution fields", () => {
    const illegalPayloadWithAmount = {
      reasonClass: "INSUFFICIENT_FUNDS",
      confidence: 0.90,
      summary: "Insufficient funds",
      evidence: ["Insufficient balance"],
      recommendedHandling: "RETRY_CANDIDATE",
      uncertainties: [],
      // FORBIDDEN FIELDS:
      amount: 5000,
      paymentLinkId: "plink_illegal_123",
      canExecute: true,
      authorizeRefund: true,
    };

    const result = AiDiagnosisStructuredOutputSchema.safeParse(illegalPayloadWithAmount);
    expect(result.success).toBe(false);
  });

  it("fails closed on empty summary or empty evidence list", () => {
    const emptySummary = {
      reasonClass: "USER_ABORTED",
      confidence: 0.95,
      summary: "", // Empty string not allowed
      evidence: ["User cancelled modal"],
      recommendedHandling: "REQUEST_ALTERNATE_METHOD",
      uncertainties: [],
    };

    const emptyEvidence = {
      reasonClass: "USER_ABORTED",
      confidence: 0.95,
      summary: "User cancelled",
      evidence: [], // Empty array not allowed
      recommendedHandling: "REQUEST_ALTERNATE_METHOD",
      uncertainties: [],
    };

    expect(AiDiagnosisStructuredOutputSchema.safeParse(emptySummary).success).toBe(false);
    expect(AiDiagnosisStructuredOutputSchema.safeParse(emptyEvidence).success).toBe(false);
  });
});

describe("Data Minimization & Sensitive Redaction Tests", () => {
  it("redacts credit/debit card PAN numbers (13-19 digits)", () => {
    const textWithPAN = "Card 4111 2222 3333 4444 declined with insufficient funds";
    const redacted = redactSensitiveText(textWithPAN);
    expect(redacted).not.toContain("4111");
    expect(redacted).not.toContain("4444");
    expect(redacted).toContain("[REDACTED_CARD_PAN]");
  });

  it("redacts CVV/CVC codes", () => {
    const textWithCVV = "Transaction failure error code CVV: 789 or security code 1234";
    const redacted = redactSensitiveText(textWithCVV);
    expect(redacted).not.toContain("789");
    expect(redacted).not.toContain("1234");
    expect(redacted).toContain("[REDACTED_CVV]");
  });

  it("redacts card expiry dates", () => {
    const textWithExpiry = "Card with expiry 12/28 was rejected by issuer";
    const redacted = redactSensitiveText(textWithExpiry);
    expect(redacted).not.toContain("12/28");
    expect(redacted).toContain("[REDACTED_EXPIRY]");
  });

  it("redacts Razorpay webhook signatures and API keys", () => {
    const textWithSecret = "Received signature sha256=a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 with rzp_live_secretkey999";
    const redacted = redactSensitiveText(textWithSecret);
    expect(redacted).not.toContain("rzp_live_secretkey999");
    expect(redacted).toContain("[REDACTED_SIGNATURE]");
    expect(redacted).toContain("[REDACTED_API_KEY]");
  });

  it("redacts Bearer authentication tokens", () => {
    const textWithToken = "Auth header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const redacted = redactSensitiveText(textWithToken);
    expect(redacted).not.toContain("eyJhbGciOi");
    expect(redacted).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("masks customer email and phone to prevent PII leakage", () => {
    expect(maskEmail("john.doe@example.com")).toBe("j******e@example.com");
    expect(maskEmail(null)).toBeNull();

    expect(maskPhone("+919876543210")).toBe("+91******3210");
    expect(maskPhone(null)).toBeNull();
  });

  it("sanitizeDiagnosisInput filters raw inputs to only allowed non-PII diagnostic metadata", () => {
    const rawInput = {
      failureCode: "BAD_REQUEST_ERROR",
      failureReason: "Card 4111222233334444 failed with cvv: 123",
      currency: "inr",
      attemptCount: 1,
      errorCategory: "GATEWAY_ERROR",
      errorSource: "bank",
      errorStep: "payment_authorization",
      // Extra sensitive fields that should not be passed
      paymentId: "pay_sensitive_123",
      customerEmail: "user@example.com",
    };

    const sanitized = sanitizeDiagnosisInput(rawInput);

    expect(sanitized.failureCode).toBe("BAD_REQUEST_ERROR");
    expect(sanitized.failureReason).toContain("[REDACTED_CARD_PAN]");
    expect(sanitized.failureReason).toContain("[REDACTED_CVV]");
    expect(sanitized.currency).toBe("INR");
    expect(sanitized.pastAttemptCount).toBe(1);
    expect((sanitized as unknown as Record<string, unknown>)["paymentId"]).toBeUndefined();
    expect((sanitized as unknown as Record<string, unknown>)["customerEmail"]).toBeUndefined();
  });
});

describe("Safe Fallback & Fail-Closed Behavior", () => {
  it("produces non-actionable MANUAL_REVIEW fallback on model error or timeout", () => {
    const fallback = createSafeFallbackDiagnosis(
      "TIMEOUT",
      "Model inference timed out after 8000ms",
      "gemini-1.5-flash"
    );

    expect(fallback.validationStatus).toBe("TIMEOUT");
    expect(fallback.structuredOutput.reasonClass).toBe("UNKNOWN_AMBIGUITY");
    expect(fallback.structuredOutput.confidence).toBe(0.0);
    expect(fallback.structuredOutput.recommendedHandling).toBe("MANUAL_REVIEW");
    expect(fallback.structuredOutput.evidence[0]).toContain("timed out");
    expect(fallback.structuredOutput.uncertainties.length).toBeGreaterThan(0);
  });
});
