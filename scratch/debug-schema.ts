import { PaymentFailedWebhookSchema } from "../src/lib/webhook";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ev = await prisma.webhookEvent.findFirst({
    where: { eventId: "TY1CTNhM3Iepti" },
  });
  if (!ev) {
    console.log("No event found");
    return;
  }
  const result = PaymentFailedWebhookSchema.safeParse(ev.payload);
  console.log("SUCCESS:", result.success);
  if (!result.success) {
    console.log("ERRORS:", JSON.stringify(result.error.format(), null, 2));
  }
}

main().finally(() => prisma.$disconnect());
