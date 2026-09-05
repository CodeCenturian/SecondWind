const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ev = await prisma.webhookEvent.findFirst({
    where: { eventId: 'TY1CTNhM3Iepti' },
  });
  console.log('PAYLOAD:', JSON.stringify(ev.payload, null, 2));
}

main().finally(() => prisma.$disconnect());
