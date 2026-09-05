import { PrismaClient, CaseStatus, AttemptChannel, AttemptStatus, AuditActorType, RecoveryCase, RecoveryAttempt } from "@prisma/client";
import { evaluateRecoveryPolicy } from "../policy/engine";
import { PolicyDecision, PolicyEvaluationInput } from "../policy/types";
import { ProviderAdapter, RazorpayAdapter } from "../adapters/provider-adapter";
import { ConcurrencyConflictError, PolicyViolationError, EntityNotFoundError } from "../errors";
import { safeJson } from "../audit";

export interface ExecuteRecoveryActionParams {
  caseId: string;
  requestedChannel: AttemptChannel;
  idempotencyKey: string;
  expectedVersion: number;
  actorId?: string | null;
  actorType?: AuditActorType;
  adapter?: ProviderAdapter;
}

export interface ExecuteRecoveryActionResult {
  success: boolean;
  decision: PolicyDecision;
  attempt: RecoveryAttempt;
  updatedCase: RecoveryCase;
  isDuplicateRequest: boolean;
}

/**
 * Bounded recovery orchestrator.
 * Evaluates pure merchant policy, calls external provider adapter OUTSIDE db transaction,
 * and then atomically applies results with optimistic locking and audit trail.
 */
export async function executeRecoveryAction(
  prisma: PrismaClient,
  params: ExecuteRecoveryActionParams
): Promise<ExecuteRecoveryActionResult> {
  const {
    caseId,
    requestedChannel,
    idempotencyKey,
    expectedVersion,
    actorId = null,
    actorType = AuditActorType.OPERATOR,
    adapter = new RazorpayAdapter(),
  } = params;

  // 1. Fetch current case, its past attempts, and merchant policy
  const currentCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      attempts: {
        orderBy: { attemptNumber: "asc" },
      },
      merchantPolicy: true,
      auditLogs: true,
      refundTasks: true,
    },
  });

  if (!currentCase) {
    throw new EntityNotFoundError("RecoveryCase", caseId);
  }

  // 2. Optimistic Concurrency Check
  if (currentCase.version !== expectedVersion) {
    throw new ConcurrencyConflictError(caseId, expectedVersion, currentCase.version);
  }

  // Compute duplicate risk status from case state, refund tasks, and audit logs
  const isDuplicateRisk = Boolean(
    (currentCase.refundTasks && currentCase.refundTasks.length > 0) ||
    (currentCase.auditLogs &&
      currentCase.auditLogs.some(
        (l) =>
          l.action.includes("DUPLICATE_RACE") ||
          l.action.includes("ADVERSARIAL") ||
          l.action.includes("DUPLICATE_RISK")
      ))
  );

  // 3. Idempotency Check: check if this idempotency key was already executed
  const existingAttempt = currentCase.attempts.find((att) => {
    const meta = att.metadata as Record<string, unknown> | null;
    return meta?.["idempotencyKey"] === idempotencyKey;
  });

  if (existingAttempt) {
    // Replay evaluation idempotently
    const evaluationInput: PolicyEvaluationInput = {
      caseId: currentCase.id,
      caseStatus: currentCase.status,
      caseVersion: currentCase.version,
      amountMinor: currentCase.amountMinor,
      currency: currentCase.currency,
      merchantPolicy: {
        policyId: currentCase.merchantPolicy?.id ?? "default",
        policyVersion: 1,
        isActive: true,
        maxAttempts: currentCase.merchantPolicy?.maxAttempts ?? 3,
        coolingPeriodMinutes: currentCase.merchantPolicy?.coolingPeriodMinutes ?? 30,
        linkExpiryMinutes: currentCase.merchantPolicy?.linkExpiryMinutes ?? 1440,
        supportedCurrencies: ["INR", "USD"],
        allowedChannels: currentCase.merchantPolicy?.preferredChannels ?? [
          AttemptChannel.PAYMENT_LINK,
          AttemptChannel.EMAIL,
        ],
        autoRefundEnabled: currentCase.merchantPolicy?.autoRefundEnabled ?? false,
      },
      pastAttempts: currentCase.attempts.map((a) => ({
        attemptNumber: a.attemptNumber,
        channel: a.channel,
        status: a.status,
        createdAt: a.createdAt,
      })),
      currentTime: new Date(),
      isDoNotContact: false,
      diagnosis: {
        category: "INSUFFICIENT_FUNDS",
        confidence: 0.95,
        isRecoverable: true,
      },
      duplicateRiskDetected: isDuplicateRisk,
      hasCustomerContact: Boolean(currentCase.customerEmail || currentCase.customerPhone),
      hasOrderOrPaymentRef: Boolean(currentCase.paymentId || currentCase.orderId),
    };

    const decision = evaluateRecoveryPolicy(evaluationInput);

    return {
      success: true,
      decision,
      attempt: existingAttempt,
      updatedCase: currentCase,
      isDuplicateRequest: true,
    };
  }

  // 4. Construct Policy Evaluation Input
  const policyRules = currentCase.merchantPolicy
    ? {
        policyId: currentCase.merchantPolicy.id,
        policyVersion: 1,
        isActive: true,
        maxAttempts: currentCase.merchantPolicy.maxAttempts,
        coolingPeriodMinutes: currentCase.merchantPolicy.coolingPeriodMinutes,
        linkExpiryMinutes: currentCase.merchantPolicy.linkExpiryMinutes,
        supportedCurrencies: ["INR", "USD"],
        allowedChannels: currentCase.merchantPolicy.preferredChannels,
        autoRefundEnabled: currentCase.merchantPolicy.autoRefundEnabled,
      }
    : {
        policyId: "default",
        policyVersion: 1,
        isActive: true,
        maxAttempts: 3,
        coolingPeriodMinutes: 30,
        linkExpiryMinutes: 1440,
        supportedCurrencies: ["INR"],
        allowedChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
        autoRefundEnabled: false,
      };

  const evaluationInput: PolicyEvaluationInput = {
    caseId: currentCase.id,
    caseStatus: currentCase.status,
    caseVersion: currentCase.version,
    amountMinor: currentCase.amountMinor,
    currency: currentCase.currency,
    merchantPolicy: policyRules,
    pastAttempts: currentCase.attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      channel: a.channel,
      status: a.status,
      createdAt: a.createdAt,
    })),
    currentTime: new Date(),
    isDoNotContact: false,
    diagnosis: {
      category: currentCase.failureCode || "PAYMENT_FAILURE",
      confidence: 0.92,
      isRecoverable: true,
      explanation: currentCase.failureReason || undefined,
    },
    duplicateRiskDetected: isDuplicateRisk,
    hasCustomerContact: Boolean(currentCase.customerEmail || currentCase.customerPhone),
    hasOrderOrPaymentRef: Boolean(currentCase.paymentId || currentCase.orderId),
  };

  // 5. Evaluate Pure Policy Engine
  const decision = evaluateRecoveryPolicy(evaluationInput);

  if (decision.outcome !== "ALLOW_ACTION") {
    // Audit blocked action attempt
    await prisma.caseAuditLog.create({
      data: {
        caseId: currentCase.id,
        action: "RECOVERY_ACTION_BLOCKED",
        actorType,
        actorId,
        previousState: { status: currentCase.status, version: currentCase.version },
        newState: { status: currentCase.status, decision: decision.outcome },
        reason: decision.reasons.join(", "),
        metadata: safeJson({
          decision,
          idempotencyKey,
          requestedChannel,
        }),
      },
    });

    throw new PolicyViolationError(
      `Recovery action blocked by policy [${decision.outcome}]: ${decision.nextStoppingRule}`,
      { decision: safeJson(decision) as Record<string, unknown> }
    );
  }

  if (!decision.allowedActionTypes.includes(requestedChannel)) {
    throw new PolicyViolationError(
      `Requested channel "${requestedChannel}" is not in policy allowed channels (${decision.allowedActionTypes.join(", ")})`
    );
  }

  // 6. OUT-OF-TRANSACTION External Provider Call
  const nextAttemptNumber = currentCase.attempts.length + 1;
  const linkExpiryUnix = Math.floor(Date.now() / 1000) + policyRules.linkExpiryMinutes * 60;
  
  // Generate internal opaque correlation token (strictly <= 40 chars for Razorpay reference_id)
  const correlationToken = `rcov_${currentCase.id.slice(0, 8)}_a${nextAttemptNumber}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const providerResult = await adapter.createPaymentLink({
    amountMinor: currentCase.amountMinor,
    currency: currentCase.currency,
    description: `SecondWind Recovery for ${currentCase.paymentId}`,
    customerEmail: currentCase.customerEmail,
    customerContact: currentCase.customerPhone,
    referenceId: correlationToken,
    expireByUnix: linkExpiryUnix,
    notes: {
      case_id: currentCase.id,
      attempt_number: String(nextAttemptNumber),
      merchant_id: currentCase.merchantId,
      correlation_token: correlationToken,
      idempotency_key: idempotencyKey,
    },
  });

  if (!providerResult.success) {
    // Record failed attempt outside critical path
    await prisma.caseAuditLog.create({
      data: {
        caseId: currentCase.id,
        action: "PROVIDER_LINK_CREATION_FAILED",
        actorType,
        actorId,
        reason: providerResult.error || "Provider call returned failure",
        metadata: safeJson({ idempotencyKey, correlationToken, providerResult }),
      },
    });

    throw new Error(`Provider payment link creation failed: ${providerResult.error}`);
  }

  // 7. IN-TRANSACTION Atomic Database Commit with Optimistic Lock
  const result = await prisma.$transaction(async (tx) => {
    // Atomic update enforcing version
    const updatedCount = await tx.recoveryCase.updateMany({
      where: {
        id: currentCase.id,
        version: currentCase.version,
      },
      data: {
        status: CaseStatus.IN_PROGRESS,
        version: currentCase.version + 1,
        lastAttemptAt: new Date(),
      },
    });

    if (updatedCount.count === 0) {
      throw new ConcurrencyConflictError(
        currentCase.id,
        currentCase.version,
        currentCase.version + 1
      );
    }

    // Create RecoveryAttempt record
    const createdAttempt = await tx.recoveryAttempt.create({
      data: {
        caseId: currentCase.id,
        attemptNumber: nextAttemptNumber,
        channel: requestedChannel,
        status: AttemptStatus.SENT,
        paymentLinkId: providerResult.providerPaymentLinkId,
        paymentLinkUrl: providerResult.shortUrl,
        metadata: safeJson({
          idempotencyKey,
          correlationToken,
          policyVersion: decision.policyVersion,
          decisionReasons: decision.reasons,
          providerResponse: providerResult.rawResponse,
        }),
      },
    });

    const updatedCase = await tx.recoveryCase.findUniqueOrThrow({
      where: { id: currentCase.id },
    });

    // Write immutable audit log
    await tx.caseAuditLog.create({
      data: {
        caseId: currentCase.id,
        action: "RECOVERY_ACTION_TRIGGERED",
        actorType,
        actorId,
        previousState: {
          status: currentCase.status,
          version: currentCase.version,
        },
        newState: {
          status: updatedCase.status,
          version: updatedCase.version,
          attemptNumber: nextAttemptNumber,
          channel: requestedChannel,
          paymentLinkId: providerResult.providerPaymentLinkId,
        },
        reason: `Operator triggered recovery action via ${requestedChannel}`,
        metadata: safeJson({
          decision,
          idempotencyKey,
          attemptId: createdAttempt.id,
          paymentLinkUrl: providerResult.shortUrl,
        }),
      },
    });

    return { createdAttempt, updatedCase };
  });

  return {
    success: true,
    decision,
    attempt: result.createdAttempt,
    updatedCase: result.updatedCase,
    isDuplicateRequest: false,
  };
}

/**
 * Returns current real-time policy evaluation for a case without side effects.
 */
export async function getCasePolicyEvaluation(
  prisma: PrismaClient,
  caseId: string,
  providedAiDiagnosis?: import("../ai/taxonomy").PersistedAiDiagnosis | null
): Promise<{
  caseRecord: RecoveryCase;
  decision: PolicyDecision;
  aiDiagnosis: import("../ai/taxonomy").PersistedAiDiagnosis | null;
}> {
  const currentCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      attempts: {
        orderBy: { attemptNumber: "asc" },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
      },
      merchantPolicy: true,
    },
  });

  if (!currentCase) {
    throw new EntityNotFoundError("RecoveryCase", caseId);
  }

  // Extract latest persisted AI diagnosis if available
  let activeAiDiagnosis: import("../ai/taxonomy").PersistedAiDiagnosis | null =
    providedAiDiagnosis ?? null;

  if (!activeAiDiagnosis) {
    const latestAiAudit = currentCase.auditLogs.find(
      (log) =>
        log.action === "AI_DIAGNOSIS_COMPLETED" ||
        log.action === "AI_DIAGNOSIS_FAILED"
    );

    if (latestAiAudit && latestAiAudit.metadata) {
      const meta = latestAiAudit.metadata as Record<string, unknown>;
      if (meta["structuredOutput"]) {
        activeAiDiagnosis = {
          model: (meta["model"] as string) || "gemini-1.5-flash",
          promptVersion: (meta["promptVersion"] as string) || "diagnosis-v1.0.0",
          structuredOutput: meta["structuredOutput"] as import("../ai/taxonomy").AiDiagnosisStructuredOutput,
          validationStatus: (meta["validationStatus"] as import("../ai/taxonomy").AiDiagnosisValidationStatus) || "VALID",
          evaluatedAt: (meta["evaluatedAt"] as string) || latestAiAudit.createdAt.toISOString(),
        };
      }
    }
  }

  const policyRules = currentCase.merchantPolicy
    ? {
        policyId: currentCase.merchantPolicy.id,
        policyVersion: 1,
        isActive: true,
        maxAttempts: currentCase.merchantPolicy.maxAttempts,
        coolingPeriodMinutes: currentCase.merchantPolicy.coolingPeriodMinutes,
        linkExpiryMinutes: currentCase.merchantPolicy.linkExpiryMinutes,
        supportedCurrencies: ["INR", "USD"],
        allowedChannels: currentCase.merchantPolicy.preferredChannels,
        autoRefundEnabled: currentCase.merchantPolicy.autoRefundEnabled,
      }
    : {
        policyId: "default",
        policyVersion: 1,
        isActive: true,
        maxAttempts: 3,
        coolingPeriodMinutes: 30,
        linkExpiryMinutes: 1440,
        supportedCurrencies: ["INR"],
        allowedChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
        autoRefundEnabled: false,
      };

  const evaluationInput: PolicyEvaluationInput = {
    caseId: currentCase.id,
    caseStatus: currentCase.status,
    caseVersion: currentCase.version,
    amountMinor: currentCase.amountMinor,
    currency: currentCase.currency,
    merchantPolicy: policyRules,
    pastAttempts: currentCase.attempts.map((a) => ({
      attemptNumber: a.attemptNumber,
      channel: a.channel,
      status: a.status,
      createdAt: a.createdAt,
    })),
    currentTime: new Date(),
    isDoNotContact: false,
    diagnosis: {
      category: currentCase.failureCode || "PAYMENT_FAILURE",
      confidence: activeAiDiagnosis?.structuredOutput.confidence ?? 0.92,
      isRecoverable: activeAiDiagnosis
        ? activeAiDiagnosis.structuredOutput.recommendedHandling !== "STOP"
        : true,
      explanation: currentCase.failureReason || undefined,
    },
    aiDiagnosis: activeAiDiagnosis,
    duplicateRiskDetected: false,
    hasCustomerContact: Boolean(currentCase.customerEmail || currentCase.customerPhone),
    hasOrderOrPaymentRef: Boolean(currentCase.paymentId || currentCase.orderId),
  };

  const decision = evaluateRecoveryPolicy(evaluationInput);
  return { caseRecord: currentCase, decision, aiDiagnosis: activeAiDiagnosis };
}

