import { PrismaClient, WebhookStatus } from "@prisma/client";
import { PaymentFailedWebhookSchema } from "../src/lib/webhook";
import { ingestPaymentFailure, updateWebhookEventStatus } from "../src/lib/services/case-service";
import { runAutoRecoveryPipeline } from "../src/lib/services/auto-pipeline-service";

const prisma = new PrismaClient();

async function main() {
  const ev = await prisma.webhookEvent.findFirst({
    where: { eventId: "TY1CTNhM3Iepti" },
  });
  if (!ev) return;

  const parsed = PaymentFailedWebhookSchema.parse(ev.payload);
  const paymentEntity = parsed.payload.payment.entity;
  const merchantId = parsed.account_id || "default_merchant";

  console.log("Ingesting payment failure for:", paymentEntity.id, "amount:", paymentEntity.amount);
  const ingested = await ingestPaymentFailure(prisma, {
    merchantId,
    payment: paymentEntity,
    webhookEventId: ev.eventId,
  });

  console.log("Created/Found case:", ingested.case.id, "status:", ingested.case.status);

  console.log("Running autonomous recovery pipeline...");
  const pipelineResult = await runAutoRecoveryPipeline(prisma, {
    caseId: ingested.case.id,
    merchantId,
    webhookEventId: ev.eventId,
  });

  await updateWebhookEventStatus(prisma, ev.eventId, WebhookStatus.PROCESSED);
  console.log("Pipeline result:", JSON.stringify(pipelineResult, null, 2));
}

main().finally(() => prisma.$disconnect());
