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

export const PROMPT_VERSION = "diagnosis-v1.0.0";
export const DEFAULT_AI_MODEL = "gemini-1.5-flash";

/**
 * System prompt strictly establishing the role, safety constraints, and taxonomy.
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

DOCUMENTED TAXONOMY:
${taxonomyDoc}

RECOMMENDED HANDLING STRATEGIES:
- RETRY_CANDIDATE: Transient gateway/bank downtime or recoverable failure where a delayed re-attempt via same channel is viable.
- REQUEST_ALTERNATE_METHOD: Card expired, invalid card details, or authentication failure where customer action via alternate method (UPI, new card, payment link) is needed.
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
 * Never throws uncaught errors: always fails closed safely.
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

  const modelName = customModelName || DEFAULT_AI_MODEL;
  const sanitizedInput = sanitizeDiagnosisInput(rawInput);

  let structuredOutput: AiDiagnosisStructuredOutput | null = null;
  let validationStatus: AiDiagnosisValidationStatus = "VALID";
  let failureErrorMessage: string | undefined = undefined;

  try {
    const env = getEnv();
    const google = createGoogleGenerativeAI({
      apiKey: env.GEMINI_API_KEY,
    });

    // Invoke Gemini Flash via Vercel AI SDK generateObject with timeout
    const result = await generateObject({
      model: google(modelName),
      schema: AiDiagnosisStructuredOutputSchema,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(sanitizedInput),
      abortSignal: AbortSignal.timeout(timeoutMs),
    });

    // Strict validation check on parsed object
    const validation = AiDiagnosisStructuredOutputSchema.safeParse(result.object);
    if (!validation.success) {
      validationStatus = "SCHEMA_VIOLATION";
      failureErrorMessage = `Zod schema validation failed: ${validation.error.message}`;
    } else {
      structuredOutput = validation.data;
      validationStatus = "VALID";
    }
  } catch (err: unknown) {
    const errorObj = err as Error;
    const isTimeout =
      errorObj?.name === "TimeoutError" ||
      errorObj?.name === "AbortError" ||
      errorObj?.message?.toLowerCase().includes("timeout");

    validationStatus = isTimeout ? "TIMEOUT" : "MODEL_ERROR";
    failureErrorMessage = errorObj instanceof Error ? errorObj.message : "Unknown AI error";
  }

  const diagnosis: PersistedAiDiagnosis = structuredOutput
    ? {
        model: modelName,
        promptVersion: PROMPT_VERSION,
        structuredOutput,
        validationStatus: "VALID",
        evaluatedAt: new Date().toISOString(),
      }
    : createSafeFallbackDiagnosis(validationStatus, failureErrorMessage || "AI processing failed", modelName);

  const isFallback = validationStatus !== "VALID";

  // Persist CaseAuditLog entry
  try {
    await prisma.caseAuditLog.create({
      data: {
        caseId,
        action: isFallback ? "AI_DIAGNOSIS_FAILED" : "AI_DIAGNOSIS_COMPLETED",
        actorType: AuditActorType.SYSTEM,
        actorId: actorId ?? modelName,
        reason: isFallback
          ? `AI diagnosis failed (${validationStatus}): ${failureErrorMessage}`
          : `AI diagnosis completed via ${modelName} (${diagnosis.structuredOutput.reasonClass}, confidence ${(diagnosis.structuredOutput.confidence * 100).toFixed(0)}%)`,
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
