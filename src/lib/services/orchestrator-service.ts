import { PrismaClient, Prisma, CaseStatus, AttemptChannel, AttemptStatus, AuditActorType, RecoveryCase, RecoveryAttempt } from "@prisma/client";
import { evaluateRecoveryPolicy } from "../policy/engine";
import { PolicyDecision, PolicyEvaluationInput } from "../policy/types";
import { ProviderAdapter, RazorpayAdapter } from "../adapters/provider-adapter";
import { ConcurrencyConflictError, PolicyViolationError, EntityNotFoundError } from "../errors";

/**
 * Safely converts any object containing BigInt or Dates to Prisma InputJsonValue.
 */
function safeJson(data: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  ) as Prisma.InputJsonValue;
}

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
    },
  });

  if (!currentCase) {
    throw new EntityNotFoundError("RecoveryCase", caseId);
  }

  // 2. Optimistic Concurrency Check
  if (currentCase.version !== expectedVersion) {
    throw new ConcurrencyConflictError(caseId, expectedVersion, currentCase.version);
  }

  // 3. Idempotency Check: check if this idempotency key was already executed
  const existingAttempt = currentCase.attempts.find((att) => {
    const meta = att.metadata as Record<string, unknown> | null;
    return meta?.["idempotencyKey"] === idempotencyKey;
  });

  if (existingAttempt) {
    // Return existing attempt idempotently without re-running provider call
    const evaluationInput: PolicyEvaluationInput = {
      caseId: currentCase.id,
      caseStatus: currentCase.status,
      caseVersion: currentCase.version,
      amountMinor: currentCase.amountMinor,
      currency: currentCase.currency,
      merchantPolicy: {
        policyId: currentCase.merchantPolicy?.id || "default",
        policyVersion: 1,
        isActive: true,
        maxAttempts: currentCase.merchantPolicy?.maxAttempts ?? 3,
        coolingPeriodMinutes: currentCase.merchantPolicy?.coolingPeriodMinutes ?? 30,
        linkExpiryMinutes: currentCase.merchantPolicy?.linkExpiryMinutes ?? 1440,
        supportedCurrencies: ["INR"],
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
      duplicateRiskDetected: false,
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
    duplicateRiskDetected: false,
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

  const providerResult = await adapter.createPaymentLink({
    amountMinor: currentCase.amountMinor,
    currency: currentCase.currency,
    description: `SecondWind Recovery for ${currentCase.paymentId}`,
    customerEmail: currentCase.customerEmail,
    customerContact: currentCase.customerPhone,
    referenceId: idempotencyKey,
    expireByUnix: linkExpiryUnix,
    notes: {
      case_id: currentCase.id,
      attempt_number: String(nextAttemptNumber),
      merchant_id: currentCase.merchantId,
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
        metadata: safeJson({ idempotencyKey, providerResult }),
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
  caseId: string
): Promise<{ caseRecord: RecoveryCase; decision: PolicyDecision }> {
  const currentCase = await prisma.recoveryCase.findUnique({
    where: { id: caseId },
    include: {
      attempts: {
        orderBy: { attemptNumber: "asc" },
      },
      merchantPolicy: true,
    },
  });

  if (!currentCase) {
    throw new EntityNotFoundError("RecoveryCase", caseId);
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
      confidence: 0.92,
      isRecoverable: true,
      explanation: currentCase.failureReason || undefined,
    },
    duplicateRiskDetected: false,
    hasCustomerContact: Boolean(currentCase.customerEmail || currentCase.customerPhone),
    hasOrderOrPaymentRef: Boolean(currentCase.paymentId || currentCase.orderId),
  };

  const decision = evaluateRecoveryPolicy(evaluationInput);
  return { caseRecord: currentCase, decision };
}
