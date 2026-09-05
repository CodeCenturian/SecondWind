const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.recoveryCase.findUnique({
    where: { id: '6fdf2231-141a-4ec0-ba91-77b874966206' },
    include: {
      auditLogs: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  console.log('--- RECOVERY CASE ---');
  console.log({
    id: c.id,
    paymentId: c.paymentId,
    amountMinor: c.amountMinor,
    currency: c.currency,
    status: c.status,
    failureCode: c.failureCode,
    failureReason: c.failureReason,
    aiAnalysis: c.aiAnalysis,
    policyDecision: c.policyDecision,
    policyReason: c.policyReason,
    recoveryChannel: c.recoveryChannel,
  });
  console.log('--- AUDIT LOGS ---');
  c.auditLogs.forEach(l => {
    console.log(`[${l.action}] - ${l.reason}`);
  });
}

main().finally(() => prisma.$disconnect());
