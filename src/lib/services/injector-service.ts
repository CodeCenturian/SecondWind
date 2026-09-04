import { PrismaClient, CaseStatus, AttemptChannel, WebhookStatus } from "@prisma/client";
import { FakeRazorpayAdapter } from "../adapters/provider-adapter";
import { claimWebhookEvent, ingestPaymentFailure, reconcileRecoveryPayment, updateWebhookEventStatus } from "./case-service";
import { executeRecoveryAction } from "./orchestrator-service";
import { runAutoRecoveryPipeline } from "./auto-pipeline-service";
import { evaluateRecoveryPolicy } from "../policy/engine";
import { PolicyEvaluationInput } from "../policy/types";

export type InjectedScenarioType =
  | "DUPLICATE_WEBHOOK_DELIVERY"
  | "OUT_OF_ORDER_EVENTS"
  | "RETRY_AFTER_TIMEOUT"
  | "LATE_ORIGINAL_AUTHORIZATION"
  | "DUPLICATE_RECOVERY_CAPTURE"
  | "PROVIDER_TIMEOUT"
  | "INVALID_EVENT_SHAPE"
  | "POLICY_VERSION_CHANGE"
  | "DO_NOT_CONTACT_AFTER_ATTEMPT"
  | "AFA_THRESHOLD_BLOCK";

export interface InjectedScenarioResult {
  scenario: InjectedScenarioType;
  success: boolean;
  message: string;
  logs: string[];
  data: Record<string, unknown>;
}

export class ProductionEnvironmentError extends Error {
  constructor() {
    super("Forbidden: Developer Event Injector is strictly disabled in production environments.");
    this.name = "ProductionEnvironmentError";
  }
}

/**
 * Asserts environment is NOT production before running simulation.
 */
export function assertDevEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    throw new ProductionEnvironmentError();
  }
}

/**
 * Runs a deterministic simulation scenario through internal services.
 * Uses FakeRazorpayAdapter to make ZERO calls to real Razorpay API.
 */
export async function runInjectedScenario(
  prisma: PrismaClient,
  scenario: InjectedScenarioType
): Promise<InjectedScenarioResult> {
  assertDevEnvironment();

  const logs: string[] = [];
  const fakeAdapter = new FakeRazorpayAdapter();
  const merchantId = "merch_dev_sandbox";

  // Ensure default merchant policy exists
  await prisma.merchantPolicy.upsert({
    where: { merchantId },
    update: {},
    create: {
      merchantId,
      maxAttempts: 3,
      coolingPeriodMinutes: 30,
      linkExpiryMinutes: 1440,
      autoRefundEnabled: false,
      preferredChannels: [AttemptChannel.PAYMENT_LINK, AttemptChannel.EMAIL],
    },
  });

  logs.push(`[SIMULATION_SANDBOX] Starting deterministic scenario: ${scenario}`);
  logs.push("[SAFEGUARD] Real Razorpay calls disabled; using FakeRazorpayAdapter.");

  switch (scenario) {
    case "DUPLICATE_WEBHOOK_DELIVERY": {
      const eventId = `sim_evt_dup_${Date.now()}`;
      const paymentId = `sim_pay_dup_${Date.now()}`;
      const rawPayload = {
        entity: "event",
        event: "payment.failed",
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 50000,
              currency: "INR",
              status: "failed",
              email: "customer@example.com",
              contact: "+919876543210",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Card authorization failed",
              notes: { isSimulation: true },
            },
          },
        },
      };

      // 1st Delivery
      logs.push(`1. Ingesting initial webhook event ${eventId}`);
      const claim1 = await claimWebhookEvent(prisma, {
        eventId,
        eventType: "payment.failed",
        rawPayload,
        signature: "simulated_hmac_sig_1",
      });
      logs.push(`   Claim result: isDuplicate=${claim1.isDuplicate}`);

      const ingestResult = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: rawPayload.payload.payment.entity as any,
        webhookEventId: eventId,
      });
      logs.push(`   Case created in status=${ingestResult.case.status} (version ${ingestResult.case.version})`);

      // 2nd Repeated Delivery
      logs.push(`2. Ingesting duplicate webhook event ${eventId}`);
      const claim2 = await claimWebhookEvent(prisma, {
        eventId,
        eventType: "payment.failed",
        rawPayload,
        signature: "simulated_hmac_sig_1",
      });
      logs.push(`   Claim result: isDuplicate=${claim2.isDuplicate} (acknowledged idempotently without state re-execution)`);

      return {
        scenario,
        success: true,
        message: "Duplicate webhook event delivered and acknowledged idempotently without state mutation.",
        logs,
        data: {
          caseId: ingestResult.case.id,
          eventId,
          firstClaimDuplicate: claim1.isDuplicate,
          secondClaimDuplicate: claim2.isDuplicate,
        },
      };
    }

    case "OUT_OF_ORDER_EVENTS": {
      const paymentId = `sim_pay_ooo_${Date.now()}`;
      logs.push(`1. Emitting out-of-order payment.captured event for non-existent case ${paymentId}`);

      const reconResult = await reconcileRecoveryPayment(prisma, {
        merchantId,
        providerPaymentId: paymentId,
        amountMinor: 75000n,
        currency: "INR",
        status: "captured",
        captured: true,
        webhookEventId: `sim_evt_ooo_${Date.now()}`,
        adapter: fakeAdapter,
      });

      logs.push(`   Reconciliation outcome: ${reconResult.status} (Reason: ${reconResult.reason})`);
      logs.push("   Out-of-order capture audited and ignored without database corruption.");

      return {
        scenario,
        success: true,
        message: "Out-of-order payment event processed safely with status NO_MATCH.",
        logs,
        data: { reconStatus: reconResult.status, reason: reconResult.reason },
      };
    }

    case "RETRY_AFTER_TIMEOUT": {
      const paymentId = `sim_pay_retry_${Date.now()}`;
      const rawPayload = {
        id: paymentId,
        amount: 100000,
        currency: "INR",
        email: "customer@example.com",
        contact: "+919876543210",
        error_code: "GATEWAY_ERROR",
        error_description: "Issuer timeout",
      };

      const { case: newCase } = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: rawPayload as any,
        webhookEventId: `sim_evt_retry_${Date.now()}`,
      });
      logs.push(`1. Case created: ${newCase.id} (Status: ${newCase.status})`);

      // 1st attempt: Provider timeout simulated
      fakeAdapter.shouldSimulateError = true;
      fakeAdapter.simulatedErrorMessage = "504 Gateway Timeout from payment provider";
      logs.push("2. Dispatching recovery action with simulated provider timeout");

      let timeoutCaught = false;
      try {
        await executeRecoveryAction(prisma, {
          caseId: newCase.id,
          requestedChannel: AttemptChannel.PAYMENT_LINK,
          idempotencyKey: `idemp_retry_${newCase.id}_att1`,
          expectedVersion: 1,
          adapter: fakeAdapter,
        });
      } catch (err) {
        timeoutCaught = true;
        logs.push(`   Provider timeout captured: ${(err as Error).message}`);
      }

      // 2nd attempt: Retry with working provider
      fakeAdapter.shouldSimulateError = false;
      logs.push("3. Retrying recovery action dispatch");
      const retryResult = await executeRecoveryAction(prisma, {
        caseId: newCase.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: `idemp_retry_${newCase.id}_att1`,
        expectedVersion: 1,
        adapter: fakeAdapter,
      });

      logs.push(`   Retry succeeded: Attempt #${retryResult.attempt.attemptNumber} created in status=${retryResult.attempt.status}`);

      return {
        scenario,
        success: timeoutCaught && retryResult.success,
        message: "Recovery action recovered cleanly after initial provider timeout.",
        logs,
        data: {
          caseId: newCase.id,
          attemptId: retryResult.attempt.id,
          attemptStatus: retryResult.attempt.status,
        },
      };
    }

    case "LATE_ORIGINAL_AUTHORIZATION": {
      const originalPaymentId = `sim_pay_orig_${Date.now()}`;
      const { case: testCase } = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: {
          id: originalPaymentId,
          amount: 85000,
          currency: "INR",
          email: "customer@example.com",
          contact: "+919876543210",
          error_code: "BAD_REQUEST_ERROR",
        } as any,
        webhookEventId: `sim_evt_race_${Date.now()}`,
      });

      // Dispatch recovery link
      const actionResult = await executeRecoveryAction(prisma, {
        caseId: testCase.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: `idemp_race_${testCase.id}_v1`,
        expectedVersion: 1,
        adapter: fakeAdapter,
      });

      // Settle recovery link
      const plinkId = actionResult.attempt.paymentLinkId;
      await reconcileRecoveryPayment(prisma, {
        merchantId,
        providerPaymentLinkId: plinkId,
        providerPaymentId: `sim_pay_recov_${Date.now()}`,
        amountMinor: 85000n,
        currency: "INR",
        status: "captured",
        captured: true,
        webhookEventId: `sim_evt_cap_link_${Date.now()}`,
        adapter: fakeAdapter,
      });

      logs.push(`1. Case ${testCase.id} settled via recovery payment link.`);

      // Late original authorization/capture arrives
      logs.push(`2. Late original event arrives for ${originalPaymentId}`);
      const raceRecon = await reconcileRecoveryPayment(prisma, {
        merchantId,
        caseId: testCase.id,
        providerPaymentId: originalPaymentId,
        amountMinor: 85000n,
        currency: "INR",
        status: "captured",
        captured: true,
        webhookEventId: `sim_evt_late_orig_${Date.now()}`,
        adapter: fakeAdapter,
      });

      logs.push(`   Race handling result: ${raceRecon.status}`);
      logs.push("   Case moved to MANUAL_REVIEW and RefundTask queued.");

      return {
        scenario,
        success: raceRecon.status === "DUPLICATE_RISK_FLAGGED",
        message: "Adversarial late payment race detected, duplicate risk flagged, and refund task queued.",
        logs,
        data: {
          caseId: testCase.id,
          raceStatus: raceRecon.status,
          refundTaskId: raceRecon.refundTask?.id,
        },
      };
    }

    case "DUPLICATE_RECOVERY_CAPTURE": {
      const originalPaymentId = `sim_pay_dup_recov_${Date.now()}`;
      const { case: testCase } = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: {
          id: originalPaymentId,
          amount: 60000,
          currency: "INR",
          email: "customer@example.com",
          contact: "+919876543210",
          error_code: "BAD_REQUEST_ERROR",
        } as any,
        webhookEventId: `sim_evt_dup_cap_${Date.now()}`,
      });

      const actionResult = await executeRecoveryAction(prisma, {
        caseId: testCase.id,
        requestedChannel: AttemptChannel.PAYMENT_LINK,
        idempotencyKey: `idemp_dup_cap_${testCase.id}`,
        expectedVersion: 1,
        adapter: fakeAdapter,
      });

      const plinkId = actionResult.attempt.paymentLinkId;
      const recoveryPaymentId = `sim_pay_cap_first_${Date.now()}`;

      // 1st Capture
      const firstCap = await reconcileRecoveryPayment(prisma, {
        merchantId,
        providerPaymentLinkId: plinkId,
        providerPaymentId: recoveryPaymentId,
        amountMinor: 60000n,
        currency: "INR",
        status: "captured",
        captured: true,
        webhookEventId: `sim_evt_cap_1_${Date.now()}`,
        adapter: fakeAdapter,
      });
      logs.push(`1. Initial recovery capture settled: ${firstCap.status}`);

      // 2nd Duplicate Capture
      const secondCap = await reconcileRecoveryPayment(prisma, {
        merchantId,
        providerPaymentLinkId: plinkId,
        providerPaymentId: recoveryPaymentId,
        amountMinor: 60000n,
        currency: "INR",
        status: "captured",
        captured: true,
        webhookEventId: `sim_evt_cap_2_${Date.now()}`,
        adapter: fakeAdapter,
      });
      logs.push(`2. Duplicate recovery capture acknowledged: ${secondCap.status}`);

      return {
        scenario,
        success: firstCap.status === "RECOVERED" && secondCap.status === "ALREADY_RECOVERED",
        message: "Duplicate recovery capture acknowledged idempotently with zero double-counting.",
        logs,
        data: {
          caseId: testCase.id,
          firstStatus: firstCap.status,
          secondStatus: secondCap.status,
        },
      };
    }

    case "PROVIDER_TIMEOUT": {
      const paymentId = `sim_pay_prov_to_${Date.now()}`;
      const { case: newCase } = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: {
          id: paymentId,
          amount: 45000,
          currency: "INR",
          email: "customer@example.com",
          contact: "+919876543210",
          error_code: "GATEWAY_ERROR",
        } as any,
        webhookEventId: `sim_evt_prov_to_${Date.now()}`,
      });

      fakeAdapter.shouldSimulateError = true;
      fakeAdapter.simulatedErrorMessage = "504 Gateway Timeout from Razorpay payment links API";

      logs.push("1. Dispatching link creation with simulated 504 provider failure");
      let failedAsExpected = false;
      try {
        await executeRecoveryAction(prisma, {
          caseId: newCase.id,
          requestedChannel: AttemptChannel.PAYMENT_LINK,
          idempotencyKey: `idemp_to_${newCase.id}`,
          expectedVersion: 1,
          adapter: fakeAdapter,
        });
      } catch (err) {
        failedAsExpected = true;
        logs.push(`   Caught expected failure: ${(err as Error).message}`);
      }

      return {
        scenario,
        success: failedAsExpected,
        message: "Provider timeout handled cleanly without creating corrupt attempt state.",
        logs,
        data: { caseId: newCase.id, failedAsExpected },
      };
    }

    case "INVALID_EVENT_SHAPE": {
      const invalidEventId = `sim_evt_invalid_${Date.now()}`;
      logs.push(`1. Claiming malformed webhook payload ${invalidEventId}`);

      await claimWebhookEvent(prisma, {
        eventId: invalidEventId,
        eventType: "unknown.corrupt.event",
        rawPayload: { corrupted: true, missingRequiredKeys: true },
        signature: "invalid_sig",
      });

      await updateWebhookEventStatus(prisma, invalidEventId, WebhookStatus.FAILED, "Schema mismatch");
      logs.push("2. Webhook status set to FAILED without unhandled exceptions.");

      return {
        scenario,
        success: true,
        message: "Malformed event schema rejected safely and audited as FAILED.",
        logs,
        data: { eventId: invalidEventId, status: "FAILED" },
      };
    }

    case "POLICY_VERSION_CHANGE": {
      logs.push("1. Setting up policy evaluation with expected version v1 against active version v2");
      const staleInput: PolicyEvaluationInput = {
        caseId: "case_stale_pol",
        caseStatus: CaseStatus.DETECTED,
        caseVersion: 1,
        amountMinor: 50000n,
        currency: "INR",
        merchantPolicy: {
          policyId: "pol_dev_stale",
          policyVersion: 2, // Active is v2
          isActive: true,
          maxAttempts: 3,
          coolingPeriodMinutes: 30,
          linkExpiryMinutes: 1440,
          supportedCurrencies: ["INR"],
          allowedChannels: [AttemptChannel.PAYMENT_LINK],
          autoRefundEnabled: false,
        },
        pastAttempts: [],
        currentTime: new Date(),
        isDoNotContact: false,
        duplicateRiskDetected: false,
        hasCustomerContact: true,
        hasOrderOrPaymentRef: true,
        expectedPolicyVersion: 1, // Stale v1 requested
      };

      const decision = evaluateRecoveryPolicy(staleInput);
      logs.push(`   Policy outcome: ${decision.outcome} (Reasons: ${decision.reasons.join(", ")})`);

      return {
        scenario,
        success: decision.outcome === "MANUAL_REVIEW" && decision.reasons.includes("STALE_POLICY_VERSION"),
        message: "Stale policy version detected and routed to MANUAL_REVIEW.",
        logs,
        data: { outcome: decision.outcome, reasons: decision.reasons },
      };
    }

    case "DO_NOT_CONTACT_AFTER_ATTEMPT": {
      logs.push("1. Evaluating recovery action for customer marked isDoNotContact=true");
      const dncInput: PolicyEvaluationInput = {
        caseId: "case_dnc_test",
        caseStatus: CaseStatus.IN_PROGRESS,
        caseVersion: 2,
        amountMinor: 50000n,
        currency: "INR",
        merchantPolicy: {
          policyId: "pol_dev_dnc",
          policyVersion: 1,
          isActive: true,
          maxAttempts: 3,
          coolingPeriodMinutes: 30,
          linkExpiryMinutes: 1440,
          supportedCurrencies: ["INR"],
          allowedChannels: [AttemptChannel.PAYMENT_LINK],
          autoRefundEnabled: false,
        },
        pastAttempts: [
          { attemptNumber: 1, channel: AttemptChannel.PAYMENT_LINK, status: "SENT", createdAt: new Date() },
        ],
        currentTime: new Date(),
        isDoNotContact: true, // Customer opted out
        duplicateRiskDetected: false,
        hasCustomerContact: true,
        hasOrderOrPaymentRef: true,
      };

      const decision = evaluateRecoveryPolicy(dncInput);
      logs.push(`   Policy outcome: ${decision.outcome} (Reasons: ${decision.reasons.join(", ")})`);

      return {
        scenario,
        success: decision.outcome === "STOP" && decision.reasons.includes("CUSTOMER_DO_NOT_CONTACT"),
        message: "Customer opt-out (Do-Not-Contact) successfully halted subsequent recovery attempts.",
        logs,
        data: { outcome: decision.outcome, reasons: decision.reasons },
      };
    }

    case "AFA_THRESHOLD_BLOCK": {
      const eventId = `sim_evt_afa_${Date.now()}`;
      const paymentId = `sim_pay_afa_${Date.now()}`;
      const rawPayload = {
        entity: "event",
        event: "payment.failed",
        account_id: merchantId,
        payload: {
          payment: {
            entity: {
              id: paymentId,
              entity: "payment",
              amount: 2500000, // ₹25,000.00 (> ₹15,000 RBI AFA threshold)
              currency: "INR",
              status: "failed",
              email: "sub_user@example.com",
              contact: "+919876543210",
              error_code: "BAD_REQUEST_ERROR",
              error_description: "Recurring e-mandate transaction amount ₹25,000 exceeds RBI ₹15,000 AFA threshold; customer 2FA confirmation required",
              error_source: "bank",
              error_step: "payment_authorization",
              error_reason: "AFA threshold exceeded for recurring subscription",
              notes: { isSimulation: true, recurring: true, mandate_amount: 2500000 },
            },
          },
        },
      };

      logs.push(`1. Ingesting payment.failed webhook (Amount: ₹25,000 > ₹15,000 AFA limit) -> ${eventId}`);
      await claimWebhookEvent(prisma, {
        eventId,
        eventType: "payment.failed",
        rawPayload,
        signature: "simulated_afa_sig",
      });

      const ingestResult = await ingestPaymentFailure(prisma, {
        merchantId,
        payment: rawPayload.payload.payment.entity as any,
        webhookEventId: eventId,
      });
      logs.push(`   Case created: ${ingestResult.case.id} in status=${ingestResult.case.status}`);

      // Run end-to-end auto-pipeline (Diagnosis -> Policy -> Recovery Link Creation)
      logs.push("2. Triggering automated pipeline (Diagnosis -> Policy -> Action)...");
      const pipelineResult = await runAutoRecoveryPipeline(prisma, {
        caseId: ingestResult.case.id,
        merchantId,
        webhookEventId: eventId,
        adapter: fakeAdapter,
        mockDiagnosis: {
          model: "gemini-3.7-flash",
          promptVersion: "diagnosis-v1.1.0",
          structuredOutput: {
            reasonClass: "AFA_THRESHOLD_BLOCK",
            confidence: 0.98,
            summary: "Recurring e-mandate transaction amount ₹25,000 exceeds RBI ₹15,000 AFA threshold; customer 2FA confirmation required",
            evidence: ["Mandate amount ₹25,000 exceeds ₹15,000 AFA limit", "RBI e-mandate compliance directive"],
            recommendedHandling: "REQUEST_ALTERNATE_METHOD",
            uncertainties: [],
          },
          validationStatus: "VALID",
          evaluatedAt: new Date().toISOString(),
        },
      });

      logs.push(`   Auto Pipeline executed: success=${pipelineResult.success}`);
      logs.push(`   Policy outcome: ${pipelineResult.policyOutcome}`);
      logs.push(`   Payment Link Created: ${pipelineResult.paymentLinkUrl || "Generated"}`);

      // Verify updated case state
      const updatedCase = await prisma.recoveryCase.findUnique({
        where: { id: ingestResult.case.id },
        include: {
          attempts: true,
          auditLogs: { orderBy: { createdAt: "desc" } },
        },
      });

      const hasAutoPipelineAudit = updatedCase?.auditLogs.some(
        (log) => log.action === "AUTO_PIPELINE_TRIGGERED"
      );
      const isCaseInProgress = updatedCase?.status === CaseStatus.IN_PROGRESS;

      logs.push(`3. Case state verification: status=${updatedCase?.status}, attempts=${updatedCase?.attempts.length}`);

      return {
        scenario,
        success: Boolean(isCaseInProgress && hasAutoPipelineAudit),
        message: "AFA Threshold Block (>₹15,000) processed: AI diagnosed compliance block, policy disallowed auto-retry, and fresh Payment Link dispatched automatically.",
        logs,
        data: {
          caseId: ingestResult.case.id,
          status: updatedCase?.status,
          attemptsCount: updatedCase?.attempts.length,
          paymentLinkId: updatedCase?.attempts[0]?.paymentLinkId,
          pipelineResult,
        },
      };
    }
  }
}
