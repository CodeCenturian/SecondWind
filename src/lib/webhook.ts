import crypto from "node:crypto";
import { z } from "zod";

/**
 * Validates Razorpay Webhook HMAC-SHA256 signature using constant-time comparison.
 * Verified against official Razorpay Webhook documentation:
 * https://razorpay.com/docs/webhooks/validate-test/
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature || !secret || !rawBody) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const receivedBuffer = Buffer.from(signature.trim(), "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

/**
 * Sanitizes payload to redact sensitive payment card numbers, CVVs, or tokens before storing.
 */
export function sanitizePayload(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") {
    return { sanitized: true, rawType: typeof input };
  }

  const sensitiveKeys = new Set([
    "card_number",
    "number",
    "cvv",
    "cvv2",
    "cvc",
    "password",
    "token",
    "secret",
    "access_token",
    "authorization",
  ]);

  function redact(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map(redact);
    }
    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          result[key] = "[REDACTED]";
        } else if (typeof value === "object" && value !== null) {
          result[key] = redact(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    }
    return obj;
  }

  return redact(input) as Record<string, unknown>;
}

// Payment entity schema
export const PaymentEntitySchema = z.object({
  id: z.string(),
  entity: z.literal("payment").default("payment"),
  amount: z.number().int().nonnegative(), // minor units (e.g. 50000 = 500.00 INR)
  currency: z.string().default("INR"),
  status: z.string(),
  order_id: z.string().nullable().optional(),
  invoice_id: z.string().nullable().optional(),
  international: z.boolean().optional(),
  method: z.string().nullable().optional(),
  amount_refunded: z.number().int().nonnegative().optional().default(0),
  refund_status: z.string().nullable().optional(),
  captured: z.boolean().optional(),
  description: z.string().nullable().optional(),
  card_id: z.string().nullable().optional(),
  bank: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  vpa: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  notes: z.record(z.unknown()).optional().default({}),
  fee: z.number().optional(),
  tax: z.number().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
  error_source: z.string().nullable().optional(),
  error_step: z.string().nullable().optional(),
  error_reason: z.string().nullable().optional(),
  created_at: z.number().optional(),
});

export type PaymentEntity = z.infer<typeof PaymentEntitySchema>;

// Payment Failed Webhook Schema
export const PaymentFailedWebhookSchema = z.object({
  entity: z.literal("event").default("event"),
  account_id: z.string().optional(),
  event: z.literal("payment.failed"),
  contains: z.array(z.string()).optional(),
  created_at: z.number().optional(),
  payload: z.object({
    payment: z.object({
      entity: PaymentEntitySchema,
    }),
  }),
});

// Payment Captured Webhook Schema
export const PaymentCapturedWebhookSchema = z.object({
  entity: z.literal("event").default("event"),
  account_id: z.string().optional(),
  event: z.literal("payment.captured"),
  contains: z.array(z.string()).optional(),
  created_at: z.number().optional(),
  payload: z.object({
    payment: z.object({
      entity: PaymentEntitySchema,
    }),
  }),
});

// Payment Link Paid Webhook Schema
export const PaymentLinkPaidWebhookSchema = z.object({
  entity: z.literal("event").default("event"),
  account_id: z.string().optional(),
  event: z.literal("payment_link.paid"),
  contains: z.array(z.string()).optional(),
  created_at: z.number().optional(),
  payload: z.object({
    payment_link: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number().int().nonnegative(),
        amount_paid: z.number().int().nonnegative(),
        status: z.string(),
        reference_id: z.string().nullable().optional(),
        order_id: z.string().nullable().optional(),
        customer: z
          .object({
            name: z.string().nullable().optional(),
            email: z.string().nullable().optional(),
            contact: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      }),
    }),
    payment: z
      .object({
        entity: PaymentEntitySchema.optional(),
      })
      .optional(),
  }),
});

// Generic Fallback Webhook Schema for any valid Razorpay webhook event
export const GenericRazorpayWebhookSchema = z.object({
  entity: z.string().default("event"),
  account_id: z.string().optional(),
  event: z.string(),
  contains: z.array(z.string()).optional(),
  created_at: z.number().optional(),
  payload: z.record(z.unknown()),
});

export type GenericRazorpayWebhook = z.infer<typeof GenericRazorpayWebhookSchema>;
