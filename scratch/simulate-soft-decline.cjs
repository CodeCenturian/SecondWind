const crypto = require('crypto');

async function main() {
  require('dotenv').config();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'my_webhook_secret_123';
  const eventId = 'evt_test_insufficient_' + Date.now();
  const paymentId = 'pay_test_' + Date.now().toString(36);
  const orderId = 'order_test_' + Date.now().toString(36);

  const payload = {
    event: 'payment.failed',
    entity: 'event',
    account_id: 'acc_demo_merchant',
    created_at: Math.floor(Date.now() / 1000),
    contains: ['payment'],
    payload: {
      payment: {
        entity: {
          id: paymentId,
          entity: 'payment',
          amount: 249900, // ₹2,499.00
          currency: 'INR',
          status: 'failed',
          order_id: orderId,
          invoice_id: null,
          international: false,
          method: 'card',
          amount_refunded: 0,
          refund_status: null,
          captured: false,
          description: 'SaaS Pro Monthly Subscription',
          card_id: 'card_demo_1001',
          card: {
            id: 'card_demo_1001',
            entity: 'card',
            name: 'Demo Customer',
            last4: '4242',
            network: 'Visa',
            type: 'credit',
            issuer: 'HDFC',
            international: false,
            emi: false,
            sub_type: 'consumer'
          },
          bank: null,
          wallet: null,
          vpa: null,
          email: 'customer@example.com',
          contact: '+919876543210',
          notes: {
            plan: 'pro_monthly',
            customer_name: 'Aditi Sharma'
          },
          fee: null,
          tax: null,
          error_code: 'BAD_REQUEST_ERROR',
          error_description: 'Account balance insufficient to complete transaction. Issuer declined authorization.',
          error_source: 'bank_issuer',
          error_step: 'payment_authorization',
          error_reason: 'insufficient_funds'
        }
      }
    }
  };

  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  console.log(`\n🚀 Injecting Insufficient Funds Payment Failure (${paymentId}, ₹2,499.00)...`);
  const res = await fetch('http://localhost:3000/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
      'x-razorpay-event-id': eventId
    },
    body: rawBody
  });

  const json = await res.json();
  console.log('\n--- Webhook Response ---');
  console.log('HTTP Status:', res.status);
  console.log('Result:', JSON.stringify(json, null, 2));
  console.log(`\n✅ Done! Check your frontend at: http://localhost:3000/cases/${json.caseId}`);
}

main().catch(console.error);
