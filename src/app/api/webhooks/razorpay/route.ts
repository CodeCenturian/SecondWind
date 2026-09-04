import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  verifyRazorpaySignature,
  PaymentFailedWebhookSchema,
  PaymentCapturedWebhookSchema,
  PaymentLinkPaidWebhookSchema,
  GenericRazorpayWebhookSchema,
} from "@/lib/webhook";
import {
  claimWebhookEvent,
  ingestPaymentFailure,
  reconcileRecoveryPayment,
  updateWebhookEventStatus,
} from "@/lib/services/case-service";
import { runAutoRecoveryPipeline } from "@/lib/services/auto-pipeline-service";
import { WebhookStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");
    const eventIdHeader = req.headers.get("x-razorpay-event-id");

    const env = getEnv();

    // 1. Strict signature verification with timing-safe comparison
    const isValid = verifyRazorpaySignature(
      rawBody,
      signature,
      env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValid) {
      return NextResponse.json(
        {
          error: "Invalid or missing webhook signature",
          code: "INVALID_SIGNATURE",
        },
        { status: 401 }
      );
    }

    // 2. Parse raw JSON safely
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON webhook payload", code: "INVALID_JSON" },
        { status: 400 }
      );
    }

    // 3. Fallback generic schema validation
    const genericParsed = GenericRazorpayWebhookSchema.safeParse(parsedJson);
    if (!genericParsed.success) {
      return NextResponse.json(
        { error: "Malformed webhook payload structure", code: "MALFORMED_PAYLOAD" },
        { status: 400 }
      );
    }

    const eventPayload = genericParsed.data;
    const eventId =
      eventIdHeader?.trim() ||
      (typeof eventPayload.payload === "object" &&
      eventPayload.payload !== null &&
      "id" in eventPayload.payload
        ? String(eventPayload.payload["id"])
        : `gen_evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);

    // 4. Idempotently claim event in WebhookEvent table
    const claimResult = await claimWebhookEvent(prisma, {
      eventId,
      eventType: eventPayload.event,
      rawPayload: eventPayload,
      signature: signature || "",
    });

    if (claimResult.isDuplicate) {
      return NextResponse.json(
        {
          received: true,
          idempotent: true,
          message: "Duplicate event acknowledged without state modification",
          eventId,
        },
        { status: 200 }
      );
    }

    // 5. Handle documented event types
    const eventType = eventPayload.event;
    const merchantId = eventPayload.account_id || "default_merchant";

    if (eventType === "payment.failed") {
      const failedResult = PaymentFailedWebhookSchema.safeParse(eventPayload);
      if (failedResult.success) {
        const paymentEntity = failedResult.data.payload.payment.entity;
        
        // Ingest into RecoveryCase in DETECTED state
        const ingested = await ingestPaymentFailure(prisma, {
          merchantId,
          payment: paymentEntity,
          webhookEventId: eventId,
        });

        // Synchronously run end-to-end autonomous recovery pipeline (Diagnosis -> Policy -> Action)
        const pipelineResult = await runAutoRecoveryPipeline(prisma, {
          caseId: ingested.case.id,
          merchantId,
          webhookEventId: eventId,
        });

        await updateWebhookEventStatus(prisma, eventId, WebhookStatus.PROCESSED);

        // Fetch refreshed case state
        const updatedCase = await prisma.recoveryCase.findUnique({
          where: { id: ingested.case.id },
          select: { id: true, status: true, version: true },
        });

        return NextResponse.json(
          {
            received: true,
            eventId,
            status: "PROCESSED",
            caseId: ingested.case.id,
            caseStatus: updatedCase?.status || ingested.case.status,
            isNewCase: ingested.isNew,
            autoPipeline: pipelineResult,
          },
          { status: 200 }
        );
      } else {
        await updateWebhookEventStatus(
          prisma,
          eventId,
          WebhookStatus.FAILED,
          "Failed to parse payment.failed schema details"
        );
        return NextResponse.json(
          { received: true, eventId, status: "SCHEMA_MISMATCH" },
          { status: 200 }
        );
      }
    }

    if (eventType === "payment_link.paid") {
      const linkPaidResult = PaymentLinkPaidWebhookSchema.safeParse(eventPayload);
      if (linkPaidResult.success) {
        const plinkEntity = linkPaidResult.data.payload.payment_link.entity;
        const paymentEntity = linkPaidResult.data.payload.payment?.entity;

        const providerPaymentId =
          paymentEntity?.id || `pay_plink_${plinkEntity.id}_${Date.now()}`;
        const amountMinor = BigInt(
          paymentEntity?.amount ?? plinkEntity.amount_paid ?? plinkEntity.amount
        );
        const currency = paymentEntity?.currency || "INR";
        const isCaptured = paymentEntity ? Boolean(paymentEntity.captured) : true;
        const paymentStatus = paymentEntity?.status || plinkEntity.status || "captured";

        const reconResult = await reconcileRecoveryPayment(prisma, {
          merchantId,
          providerPaymentLinkId: plinkEntity.id,
          correlationToken: plinkEntity.reference_id,
          providerPaymentId,
          amountMinor,
          currency,
          status: paymentStatus,
          captured: isCaptured,
          webhookEventId: eventId,
          rawPayload: eventPayload as Record<string, unknown>,
        });

        await updateWebhookEventStatus(prisma, eventId, WebhookStatus.PROCESSED);

        return NextResponse.json(
          {
            received: true,
            eventId,
            status: "PROCESSED",
            reconStatus: reconResult.status,
            transitionedToRecovered: reconResult.transitionedToRecovered,
            caseId: reconResult.caseRecord?.id,
            reason: reconResult.reason,
          },
          { status: 200 }
        );
      } else {
        await updateWebhookEventStatus(
          prisma,
          eventId,
          WebhookStatus.FAILED,
          "Failed to parse payment_link.paid schema details"
        );
        return NextResponse.json(
          { received: true, eventId, status: "SCHEMA_MISMATCH" },
          { status: 200 }
        );
      }
    }

    if (eventType === "payment.captured") {
      const capturedResult = PaymentCapturedWebhookSchema.safeParse(eventPayload);
      if (capturedResult.success) {
        const paymentEntity = capturedResult.data.payload.payment.entity;
        const notes = (paymentEntity.notes || {}) as Record<string, unknown>;
        const correlationToken =
          typeof notes["correlation_token"] === "string"
            ? notes["correlation_token"]
            : typeof notes["reference_id"] === "string"
            ? notes["reference_id"]
            : null;
        const caseId =
          typeof notes["case_id"] === "string" ? notes["case_id"] : null;

        const reconResult = await reconcileRecoveryPayment(prisma, {
          merchantId,
          correlationToken,
          caseId,
          providerPaymentId: paymentEntity.id,
          amountMinor: BigInt(paymentEntity.amount),
          currency: paymentEntity.currency || "INR",
          status: paymentEntity.status || "captured",
          captured: Boolean(paymentEntity.captured),
          webhookEventId: eventId,
          rawPayload: eventPayload as Record<string, unknown>,
        });

        await updateWebhookEventStatus(prisma, eventId, WebhookStatus.PROCESSED);

        return NextResponse.json(
          {
            received: true,
            eventId,
            status: "PROCESSED",
            reconStatus: reconResult.status,
            transitionedToRecovered: reconResult.transitionedToRecovered,
            caseId: reconResult.caseRecord?.id,
            reason: reconResult.reason,
          },
          { status: 200 }
        );
      } else {
        await updateWebhookEventStatus(
          prisma,
          eventId,
          WebhookStatus.FAILED,
          "Failed to parse payment.captured schema details"
        );
        return NextResponse.json(
          { received: true, eventId, status: "SCHEMA_MISMATCH" },
          { status: 200 }
        );
      }
    }

    // 6. Unknown / Unhandled event shapes recorded as IGNORED without crashing
    await updateWebhookEventStatus(
      prisma,
      eventId,
      WebhookStatus.IGNORED,
      `Unhandled event type "${eventType}" audited and ignored`
    );

    return NextResponse.json(
      {
        received: true,
        eventId,
        status: "IGNORED",
        message: `Event ${eventType} recorded and safely ignored`,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { error: "Webhook processing failure", details: message },
      { status: 500 }
    );
  }
}
