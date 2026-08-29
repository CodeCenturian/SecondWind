import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import {
  verifyRazorpaySignature,
  PaymentFailedWebhookSchema,
  GenericRazorpayWebhookSchema,
} from "@/lib/webhook";
import {
  claimWebhookEvent,
  ingestPaymentFailure,
  updateWebhookEventStatus,
} from "@/lib/services/case-service";
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

        await updateWebhookEventStatus(prisma, eventId, WebhookStatus.PROCESSED);

        return NextResponse.json(
          {
            received: true,
            eventId,
            status: "PROCESSED",
            caseId: ingested.case.id,
            caseStatus: ingested.case.status,
            isNewCase: ingested.isNew,
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
