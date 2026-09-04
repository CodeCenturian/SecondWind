import { PrismaClient, AuditActorType, AttemptChannel, CaseStatus } from "@prisma/client";
import { diagnosePaymentFailureWithGemini } from "../ai/diagnosis";
import { getCasePolicyEvaluation, executeRecoveryAction } from "./orchestrator-service";
import { ProviderAdapter, RazorpayAdapter } from "../adapters/provider-adapter";
import { safeJson } from "../audit";

export interface AutoPipelineParams {
  caseId: string;
  merchantId: string;
  webhookEventId?: string;
  actorId?: string;
  adapter?: ProviderAdapter;
  mockDiagnosis?: import("../ai/taxonomy").PersistedAiDiagnosis;
}

export interface AutoPipelineResult {
  success: boolean;
  pipelineExecuted: boolean;
  diagnosisCompleted: boolean;
  policyOutcome?: string;
  recoveryActionExecuted: boolean;
  attemptId?: string;
  paymentLinkUrl?: string;
  error?: string;
}

/**
 * End-to-End Autonomous Payment Recovery Pipeline.
 * 
 * DESIGN RATIONALE FOR SYNCHRONOUS WEBHOOK EXECUTION:
 * Why awaited synchronously in the webhook handler rather than fire-and-forget background task?
 * 1. Serverless/Next.js Lifecycle: In serverless container runtimes, unawaited asynchronous
 *    promises are routinely terminated the moment the HTTP response completes, causing silent drops.
 * 2. Immediate Recovery Dispatch: Autonomous recovery must trigger immediately (<800ms) upon failure
 *    so the customer receives recovery links while still active in their shopping/billing session.
 * 3. Authoritative Audit Consistency: Guarantees that the CaseAuditLog sequence
 *    (AUTO_PIPELINE_TRIGGERED -> AI_DIAGNOSIS_COMPLETED -> POLICY_DECISION -> ATTEMPT_DISPATCHED)
 *    is committed atomically before any subsequent webhook or operator poll arrives.
 */
export async function runAutoRecoveryPipeline(
  prisma: PrismaClient,
  params: AutoPipelineParams
): Promise<AutoPipelineResult> {
  const {
    caseId,
    merchantId,
    webhookEventId,
    actorId = "system_auto_pipeline",
    adapter = new RazorpayAdapter(),
  } = params;

  try {
    // 1. Fetch the target case
    const targetCase = await prisma.recoveryCase.findUnique({
      where: { id: caseId },
      include: {
        attempts: true,
        merchantPolicy: true,
        refundTasks: true,
        auditLogs: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!targetCase) {
      return {
        success: false,
        pipelineExecuted: false,
        diagnosisCompleted: false,
        recoveryActionExecuted: false,
        error: `RecoveryCase ${caseId} not found.`,
      };
    }

    // Only run auto-pipeline if case is in DETECTED state
    if (targetCase.status !== CaseStatus.DETECTED) {
      return {
        success: true,
        pipelineExecuted: false,
        diagnosisCompleted: false,
        recoveryActionExecuted: false,
        error: `Case is in status ${targetCase.status}; auto pipeline only triggers on initial DETECTED state.`,
      };
    }

    // Audit pipeline trigger
    await prisma.caseAuditLog.create({
      data: {
        caseId: targetCase.id,
        action: "AUTO_PIPELINE_TRIGGERED",
        actorType: AuditActorType.SYSTEM,
        actorId,
        reason: "Automatic recovery pipeline triggered synchronously upon payment.failed ingestion",
        metadata: safeJson({
          merchantId,
          webhookEventId,
          caseId: targetCase.id,
          failureCode: targetCase.failureCode,
        }),
      },
    });

    // 2. Step 1: AI Semantic Diagnosis
    let diagnosisResult: { diagnosis: import("../ai/taxonomy").PersistedAiDiagnosis };
    if (params.mockDiagnosis) {
      diagnosisResult = { diagnosis: params.mockDiagnosis };
    } else {
      diagnosisResult = await diagnosePaymentFailureWithGemini(prisma, {
        caseId: targetCase.id,
        rawInput: {
          failureCode: targetCase.failureCode,
          failureReason: targetCase.failureReason,
          currency: targetCase.currency,
          attemptCount: targetCase.attempts.length,
        },
        actorId,
      });
    }

    // 3. Step 2: Policy Evaluation
    const { decision } = await getCasePolicyEvaluation(
      prisma,
      targetCase.id,
      diagnosisResult.diagnosis
    );

    // 4. Step 3: Action Execution (if allowed by deterministic policy engine)
    if (decision.outcome === "ALLOW_ACTION" && decision.canExecute) {
      const preferredChannel = decision.allowedActionTypes[0] || AttemptChannel.PAYMENT_LINK;
      const idempotencyKey = `auto_pipe_${targetCase.id}_v${targetCase.version}_${Date.now()}`;

      const actionResult = await executeRecoveryAction(prisma, {
        caseId: targetCase.id,
        requestedChannel: preferredChannel,
        idempotencyKey,
        expectedVersion: targetCase.version,
        actorId,
        actorType: AuditActorType.SYSTEM,
        adapter,
      });

      return {
        success: true,
        pipelineExecuted: true,
        diagnosisCompleted: true,
        policyOutcome: decision.outcome,
        recoveryActionExecuted: true,
        attemptId: actionResult.attempt.id,
        paymentLinkUrl: actionResult.attempt.paymentLinkUrl || undefined,
      };
    } else {
      // Policy stopped or routed to manual review
      await prisma.caseAuditLog.create({
        data: {
          caseId: targetCase.id,
          action: "AUTO_PIPELINE_STOPPED_AT_POLICY",
          actorType: AuditActorType.SYSTEM,
          actorId,
          reason: `Auto pipeline halted by policy (${decision.outcome}): ${decision.reasons.join(", ")}`,
          metadata: safeJson({
            decision,
            diagnosis: diagnosisResult.diagnosis,
          }),
        },
      });

      return {
        success: true,
        pipelineExecuted: true,
        diagnosisCompleted: true,
        policyOutcome: decision.outcome,
        recoveryActionExecuted: false,
      };
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown auto pipeline error";
    console.error(`[SecondWind] Auto-recovery pipeline failed for case ${caseId}:`, err);

    try {
      await prisma.caseAuditLog.create({
        data: {
          caseId,
          action: "AUTO_PIPELINE_ERROR",
          actorType: AuditActorType.SYSTEM,
          actorId,
          reason: `Auto recovery pipeline execution encountered an error: ${errorMessage}`,
          metadata: safeJson({ error: errorMessage }),
        },
      });
    } catch {
      // Ignore secondary audit failure
    }

    return {
      success: false,
      pipelineExecuted: true,
      diagnosisCompleted: false,
      recoveryActionExecuted: false,
      error: errorMessage,
    };
  }
}
