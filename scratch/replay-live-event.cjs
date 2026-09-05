const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const ev = await prisma.webhookEvent.findFirst({
    where: { eventId: 'TY1CTNhM3Iepti' },
  });
  if (!ev) {
    console.log('No event found');
    return;
  }

  // Delete from webhookEvent table so it is processed cleanly
  await prisma.webhookEvent.delete({
    where: { id: ev.id },
  });
  console.log('Deleted failed event record from DB to allow clean replay.');

  // Now post directly to localhost:3000/api/webhooks/razorpay
  const rawBody = JSON.stringify(ev.payload);
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'whsec_test_secret_123';
  const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  console.log('Posting replayed webhook to http://localhost:3000/api/webhooks/razorpay...');
  const res = await fetch('http://localhost:3000/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': 'TY1CTNhM3Iepti',
    },
    body: rawBody,
  });

  const json = await res.json();
  console.log('Response Status:', res.status);
  console.log('Response Body:', JSON.stringify(json, null, 2));
}

main().finally(() => prisma.$disconnect());
