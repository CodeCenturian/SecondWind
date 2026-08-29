/**
 * Application-wide policy constants, recovery thresholds, and verified provider model identifiers.
 */

// Officially verified Google Gemini model identifier (checked via ai.google.dev documentation)
export const VERIFIED_GEMINI_MODEL = "gemini-3.7-flash" as const;

// Fallback verified Gemini model identifiers
export const VERIFIED_GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
] as const;

// Default merchant recovery policy constants
export const POLICY_DEFAULTS = {
  MAX_RECOVERY_ATTEMPTS: 3,
  COOLING_PERIOD_MINUTES: 30,
  LINK_EXPIRY_MINUTES: 1440, // 24 hours
  DEFAULT_CURRENCY: "INR",
  DEFAULT_MAX_AUTO_REFUND_MINOR: 500000n, // ₹5,000.00 max auto refund
} as const;

// Razorpay webhook headers & identifiers
export const RAZORPAY_HEADERS = {
  SIGNATURE: "x-razorpay-signature",
  EVENT_ID: "x-razorpay-event-id",
  IDEMPOTENCY_KEY: "x-razorpay-idempotency-key",
} as const;

// Webhook events relevant to recovery operations
export const RECOVERY_WEBHOOK_EVENTS = {
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_AUTHORIZED: "payment.authorized",
  PAYMENT_CAPTURED: "payment.captured",
  PAYMENT_LINK_PAID: "payment_link.paid",
  PAYMENT_LINK_PARTIALLY_PAID: "payment_link.partially_paid",
  PAYMENT_LINK_CANCELLED: "payment_link.cancelled",
  PAYMENT_LINK_EXPIRED: "payment_link.expired",
  REFUND_CREATED: "refund.created",
  REFUND_PROCESSED: "refund.processed",
  REFUND_FAILED: "refund.failed",
} as const;
