const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.webhookEvent.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- LATEST 5 WEBHOOKS ---');
  for (const ev of events) {
    console.log({
      id: ev.id,
      eventId: ev.eventId,
      type: ev.eventType,
      status: ev.status,
      error: ev.error,
      createdAt: ev.createdAt,
    });
  }

  const cases = await prisma.recoveryCase.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  console.log('--- LATEST 5 CASES ---');
  for (const c of cases) {
    console.log({
      id: c.id,
      originalPaymentId: c.originalPaymentId,
      amountMinor: c.amountMinor.toString(),
      status: c.status,
      isDevSimulation: c.isDevSimulation,
      createdAt: c.createdAt,
    });
  }
}

main().finally(() => prisma.$disconnect());
