import "server-only";
import { PrismaClient, AuditActorType } from "@prisma/client";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { getEnv } from "../env";
import {
  AiDiagnosisStructuredOutput,
  AiDiagnosisStructuredOutputSchema,
  AiDiagnosisValidationStatus,
  PersistedAiDiagnosis,
  REASON_CLASS_DOCUMENTATION,
} from "./taxonomy";
import {
  RawDiagnosisInput,
  SanitizedDiagnosisInput,
  sanitizeDiagnosisInput,
} from "./redaction";
import { VERIFIED_GEMINI_MODEL, VERIFIED_GEMINI_FALLBACK_MODELS } from "../constants";

export const PROMPT_VERSION = "diagnosis-v1.1.0";
export const DEFAULT_AI_MODEL = VERIFIED_GEMINI_MODEL;

/**
 * System prompt strictly establishing the role, safety constraints, taxonomy, and regulatory rules.
 */
function buildSystemPrompt(): string {
  const taxonomyDoc = Object.entries(REASON_CLASS_DOCUMENTATION)
    .map(
      ([key, val]) =>
        `- ${key} (${val.title}): ${val.description} [Recoverable: ${val.typicallyRecoverable}]`
    )
    .join("\n");

  return `You are SecondWind's Payment Recovery Failure Diagnostic Specialist.
Your sole responsibility is to analyze sanitized payment failure metadata and output a structured diagnostic classification to advise merchant recovery policy.

SAFETY CONSTRAINTS:
1. You MUST ONLY classify the failure and recommend an advisory handling strategy.
2. You DO NOT have authority to execute transactions, authorize refunds, alter amounts, generate payment links, or call tools.
3. You MUST strictly select from the finite reasonClass taxonomy and recommendedHandling options.
4. Never generate transaction amounts, customer identifiers, payment/link IDs, or execution commands.
5. If the failure description is ambiguous, contradictory, or lacks sufficient signals, you MUST set recommendedHandling to "MANUAL_REVIEW" and lower your confidence score accordingly.

REGULATORY & COMPLIANCE RULES (RBI E-MANDATE / AFA DIRECTIVES):
- RBI Additional Factor of Authentication (AFA) Threshold (₹15,000): For recurring/standing instruction payments in India exceeding ₹15,000, RBI regulations mandate fresh customer 2-factor authentication (AFA). If an e-mandate transaction fails because it exceeds ₹15,000 without fresh AFA, or requires customer authentication/approval, you MUST classify it as "AFA_THRESHOLD_BLOCK" and set recommendedHandling to "REQUEST_ALTERNATE_METHOD" (NEVER "RETRY_CANDIDATE").
- Mandate Expiry / Missing: If an e-mandate registration has expired, cancelled, revoked, or is missing on the issuer bank, classify as "MANDATE_EXPIRED_OR_MISSING" and set recommendedHandling to "REQUEST_ALTERNATE_METHOD" (NEVER "RETRY_CANDIDATE").
- Critical Invariant: Retrying a compliance block (AFA threshold or expired mandate) without customer action is actively harmful and doomed to fail identically; it must always route to "REQUEST_ALTERNATE_METHOD" so a Payment Link is dispatched to collect fresh customer authentication.

DOCUMENTED TAXONOMY:
${taxonomyDoc}

RECOMMENDED HANDLING STRATEGIES:
- RETRY_CANDIDATE: Transient gateway/bank downtime or temporary recoverable failure where an automated re-attempt via same channel is viable. NEVER use for AFA_THRESHOLD_BLOCK or MANDATE_EXPIRED_OR_MISSING.
- REQUEST_ALTERNATE_METHOD: Card expired/invalid, OTP/authentication failure, AFA threshold block (>₹15,000), or expired/missing mandate where customer action via alternate method (UPI, new card, payment link for fresh auth) is required.
- MANUAL_REVIEW: Ambiguous, conflicting, high-risk, or non-standard failure requiring operator discretion.
- STOP: Suspected fraud, hard issuer refusal, or unrecoverable error where further recovery attempts are strictly prohibited.
`;
}

/**
 * User prompt containing only sanitized, non-PII metadata.
 */
function buildUserPrompt(sanitized: SanitizedDiagnosisInput): string {
  return `Please analyze the following sanitized payment failure metadata and provide a structured diagnosis:

- Failure Code: ${sanitized.failureCode}
- Failure Reason: ${sanitized.failureReason}
- Currency: ${sanitized.currency}
- Prior Recovery Attempts Count: ${sanitized.pastAttemptCount}
${sanitized.errorCategory ? `- Error Category: ${sanitized.errorCategory}` : ""}
${sanitized.errorSource ? `- Error Source: ${sanitized.errorSource}` : ""}
${sanitized.errorStep ? `- Error Step: ${sanitized.errorStep}` : ""}

Evaluate evidence, identify uncertainties, provide a concise summary, and select the precise reasonClass and recommendedHandling.`;
}

export interface DiagnosePaymentFailureParams {
  caseId: string;
  rawInput: RawDiagnosisInput;
  actorId?: string | null;
  timeoutMs?: number;
  customModelName?: string;
}

export interface DiagnosePaymentFailureResult {
  diagnosis: PersistedAiDiagnosis;
  sanitizedInput: SanitizedDiagnosisInput;
  isFallback: boolean;
  error?: string;
}

/**
 * Creates safe fallback non-actionable diagnosis failing closed to MANUAL_REVIEW.
 */
export function createSafeFallbackDiagnosis(
  validationStatus: AiDiagnosisValidationStatus,
  errorMessage: string,
  model: string = DEFAULT_AI_MODEL
): PersistedAiDiagnosis {
  const fallbackOutput: AiDiagnosisStructuredOutput = {
    reasonClass: "UNKNOWN_AMBIGUITY",
    confidence: 0.0,
    summary: "AI diagnosis unavailable or failed validation. Safe default routed to manual operator review.",
    evidence: [`Diagnostic processing failed: ${errorMessage}`],
    recommendedHandling: "MANUAL_REVIEW",
    uncertainties: [
      "AI classification output was unavailable, invalid, or timed out",
      "Manual operator inspection and verification required before any action",
    ],
  };

  return {
    model,
    promptVersion: PROMPT_VERSION,
    structuredOutput: fallbackOutput,
    validationStatus,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Server-only service: Diagnoses payment failure using Gemini Flash through Vercel AI SDK.
 * Validates structured output with Zod, sanitizes all inputs, and persists audit logs.
 * Supports automated model fallbacks and never throws uncaught errors: always fails closed safely.
 */
export async function diagnosePaymentFailureWithGemini(
  prisma: PrismaClient,
  params: DiagnosePaymentFailureParams
): Promise<DiagnosePaymentFailureResult> {
  const {
    caseId,
    rawInput,
    actorId = "system_diagnostic_agent",
    timeoutMs = 8000,
    customModelName,
  } = params;

  const candidateModels = customModelName
    ? [customModelName]
    : [VERIFIED_GEMINI_MODEL, ...VERIFIED_GEMINI_FALLBACK_MODELS];

  const sanitizedInput = sanitizeDiagnosisInput(rawInput);

  let structuredOutput: AiDiagnosisStructuredOutput | null = null;
  let validationStatus: AiDiagnosisValidationStatus = "VALID";
  let failureErrorMessage: string | undefined = undefined;
  let successfulModel = candidateModels[0] || DEFAULT_AI_MODEL;

  const env = getEnv();
  const google = createGoogleGenerativeAI({
    apiKey: env.GEMINI_API_KEY,
  });

  for (const modelCandidate of candidateModels) {
    try {
      const result = await generateObject({
        model: google(modelCandidate),
        schema: AiDiagnosisStructuredOutputSchema,
        system: buildSystemPrompt(),
        prompt: buildUserPrompt(sanitizedInput),
        abortSignal: AbortSignal.timeout(timeoutMs),
      });

      const validation = AiDiagnosisStructuredOutputSchema.safeParse(result.object);
      if (!validation.success) {
        validationStatus = "SCHEMA_VIOLATION";
        failureErrorMessage = `Zod schema validation failed: ${validation.error.message}`;
      } else {
        structuredOutput = validation.data;
        validationStatus = "VALID";
        successfulModel = modelCandidate;
        failureErrorMessage = undefined;
        break; // Successfully obtained valid diagnosis
      }
    } catch (err: unknown) {
      const errorObj = err as Error;
      const isTimeout =
        errorObj?.name === "TimeoutError" ||
        errorObj?.name === "AbortError" ||
        errorObj?.message?.toLowerCase().includes("timeout");

      validationStatus = isTimeout ? "TIMEOUT" : "MODEL_ERROR";
      failureErrorMessage = errorObj instanceof Error ? errorObj.message : "Unknown AI error";
      // Try next fallback model if available
    }
  }

  const diagnosis: PersistedAiDiagnosis = structuredOutput
    ? {
        model: successfulModel,
        promptVersion: PROMPT_VERSION,
        structuredOutput,
        validationStatus: "VALID",
        evaluatedAt: new Date().toISOString(),
      }
    : createSafeFallbackDiagnosis(validationStatus, failureErrorMessage || "AI processing failed", successfulModel);

  const isFallback = validationStatus !== "VALID";

  // Persist CaseAuditLog entry
  try {
    await prisma.caseAuditLog.create({
      data: {
        caseId,
        action: isFallback ? "AI_DIAGNOSIS_FAILED" : "AI_DIAGNOSIS_COMPLETED",
        actorType: AuditActorType.SYSTEM,
        actorId: actorId ?? successfulModel,
        reason: isFallback
          ? `AI diagnosis failed (${validationStatus}): ${failureErrorMessage}`
          : `AI diagnosis completed via ${successfulModel} (${diagnosis.structuredOutput.reasonClass}, confidence ${(diagnosis.structuredOutput.confidence * 100).toFixed(0)}%)`,
        metadata: JSON.parse(
          JSON.stringify({
            model: diagnosis.model,
            promptVersion: diagnosis.promptVersion,
            validationStatus: diagnosis.validationStatus,
            structuredOutput: diagnosis.structuredOutput,
            sanitizedInput,
            errorMessage: failureErrorMessage,
            evaluatedAt: diagnosis.evaluatedAt,
          })
        ),
      },
    });
  } catch (auditErr: unknown) {
    // Logging failure should not crash the diagnostic result
    console.error("[SecondWind] Failed to write CaseAuditLog for AI diagnosis:", auditErr);
  }

  return {
    diagnosis,
    sanitizedInput,
    isFallback,
    error: failureErrorMessage,
  };
}
