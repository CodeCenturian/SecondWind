import { z } from "zod";

/**
 * Documented Finite Taxonomy for Payment Failure Classification.
 * Every classification produced by the diagnostic service must strictly belong to this closed set.
 */
export const ReasonClassEnum = z.enum([
  "INSUFFICIENT_FUNDS",
  "AUTHENTICATION_FAILED",
  "CARD_EXPIRED_OR_INVALID",
  "TEMPORARY_BANK_DOWNTIME",
  "SUSPECTED_FRAUD",
  "DAILY_LIMIT_EXCEEDED",
  "USER_ABORTED",
  "UNKNOWN_AMBIGUITY",
]);

export type ReasonClass = z.infer<typeof ReasonClassEnum>;

/**
 * Documented taxonomy descriptions explaining each failure classification.
 */
export const REASON_CLASS_DOCUMENTATION: Record<ReasonClass, { title: string; description: string; typicallyRecoverable: boolean }> = {
  INSUFFICIENT_FUNDS: {
    title: "Insufficient Account Balance / Credit Limit",
    description: "Customer bank or card account has insufficient funds or credit limit. Often recoverable via timed retry or alternate payment instrument.",
    typicallyRecoverable: true,
  },
  AUTHENTICATION_FAILED: {
    title: "Customer Authentication / 3DS Verification Failed",
    description: "OTP expired, incorrect biometric/password, or customer dropped off during bank 3DS verification. Recoverable via re-initiating checkout link.",
    typicallyRecoverable: true,
  },
  CARD_EXPIRED_OR_INVALID: {
    title: "Card Expired or Invalid Details",
    description: "Card expiration date passed or card credentials invalid. Requires customer to provide an alternate payment method.",
    typicallyRecoverable: true,
  },
  TEMPORARY_BANK_DOWNTIME: {
    title: "Temporary Bank Gateway / Issuer Downtime",
    description: "Issuer bank or payment gateway network timeout, rate limit, or transient internal error. Strong candidate for delayed automated recovery.",
    typicallyRecoverable: true,
  },
  SUSPECTED_FRAUD: {
    title: "Suspected Fraud / Risk Engine Block",
    description: "Transaction flagged or declined by issuer risk engine or fraud detection rules. Non-recoverable; automated retry prohibited.",
    typicallyRecoverable: false,
  },
  DAILY_LIMIT_EXCEEDED: {
    title: "Daily / Transaction Volume Limit Exceeded",
    description: "Customer card or UPI account exceeded single-transaction or daily velocity limits.",
    typicallyRecoverable: true,
  },
  USER_ABORTED: {
    title: "User Aborted / Checkout Cancelled",
    description: "Customer explicitly closed the checkout window or pressed back before completion.",
    typicallyRecoverable: true,
  },
  UNKNOWN_AMBIGUITY: {
    title: "Ambiguous or Unrecognized Failure Reason",
    description: "Provider returned non-standard error payload or sparse information requiring human operator review.",
    typicallyRecoverable: false,
  },
};

/**
 * Finite Recommended Handling Actions.
 * Strictly advisory recommendations fed into deterministic policy evaluation.
 */
export const RecommendedHandlingEnum = z.enum([
  "RETRY_CANDIDATE",
  "REQUEST_ALTERNATE_METHOD",
  "MANUAL_REVIEW",
  "STOP",
]);

export type RecommendedHandling = z.infer<typeof RecommendedHandlingEnum>;

/**
 * Strict Closed Zod Schema for AI Model Structured Output.
 * Security Invariant:
 * Never permit a model-produced amount, payment/link ID, API argument, free-form tool call, or permission to execute.
 * `.strict()` explicitly forbids unrecognized or extraneous keys.
 */
export const AiDiagnosisStructuredOutputSchema = z
  .object({
    reasonClass: ReasonClassEnum,
    confidence: z
      .number()
      .min(0, "Confidence cannot be less than 0.0")
      .max(1, "Confidence cannot be greater than 1.0"),
    summary: z
      .string()
      .min(1, "Summary is required")
      .max(500, "Summary exceeds maximum length of 500 characters"),
    evidence: z
      .array(z.string().min(1, "Evidence item cannot be empty"))
      .min(1, "At least one evidence observation is required"),
    recommendedHandling: RecommendedHandlingEnum,
    uncertainties: z.array(z.string()),
  })
  .strict();

export type AiDiagnosisStructuredOutput = z.infer<typeof AiDiagnosisStructuredOutputSchema>;

/**
 * Validation status enum for diagnostic audits.
 */
export type AiDiagnosisValidationStatus =
  | "VALID"
  | "SCHEMA_VIOLATION"
  | "MODEL_ERROR"
  | "TIMEOUT"
  | "DISABLED";

export interface PersistedAiDiagnosis {
  model: string;
  promptVersion: string;
  structuredOutput: AiDiagnosisStructuredOutput;
  validationStatus: AiDiagnosisValidationStatus;
  sanitizedInputHash?: string;
  evaluatedAt: string;
}
