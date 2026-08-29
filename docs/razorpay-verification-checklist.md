# Razorpay Verification Checklist & Integration Contract

This document establishes the verified facts, constraints, official references, and unverified assumptions for the **SECONDWIND** payment recovery system. All provider-dependent logic in SECONDWIND must conform to this contract.

---

## 1. Webhook Signature Validation

- **Official Source**: [Validate and Test Webhooks](https://razorpay.com/docs/webhooks/validate-test/) | [Mintlify Markdown Source](https://razorpay-881012b3.mintlify.app/docs/us/webhooks/validate-test.md)
- **Verified Facts**:
  - Webhooks deliver an HTTP header: `X-Razorpay-Signature`.
  - The signature is calculated using **HMAC with SHA-256** algorithm.
  - The HMAC key is the configured `webhook_secret`.
  - The HMAC message is the **exact, raw, unparsed webhook request body**.
  - If `webhook_secret` is rotated, old webhook events must be validated with the old secret if retried.
- **Implementation Rule**:
  - Always validate `X-Razorpay-Signature` against `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')` using timing-safe comparison (`crypto.timingSafeEqual`).
  - Reject any payload if the signature header is missing or mismatch with HTTP 400/401.

---

## 2. Event IDs & Retry Behavior

- **Official Source**: [Validate and Test Webhooks - Idempotency & Order](https://razorpay.com/docs/webhooks/validate-test/)
- **Verified Facts**:
  - Webhook requests include the `x-razorpay-event-id` header, which is unique per event emission.
  - Razorpay delivers webhooks with **at-least-once** delivery semantics; duplicate events are expected.
  - Delivery order is **not guaranteed** (e.g., `payment.captured` can arrive before `payment.authorized`).
- **Implementation Rule**:
  - The database table `WebhookEvent` enforces a **unique constraint** on `eventId` (`x-razorpay-event-id`).
  - Webhook processing must be idempotent: duplicate event IDs must be acknowledged with HTTP 200 without re-executing side effects.
  - State machine transitions must accommodate out-of-order event arrivals safely.

---

## 3. Relevant Events & Payloads

- **Official Sources**:
  - Payments: [Payments Webhook Events](https://razorpay.com/docs/webhooks/payments/)
  - Payment Links: [Payment Links Webhook Events](https://razorpay.com/docs/webhooks/payment-links/)
  - Refunds: [Refunds Webhook Events](https://razorpay.com/docs/webhooks/refunds/)
- **Verified Facts**:
  - **Payment Events**:
    - `payment.authorized`: Payment approved by issuer, awaiting capture if manual.
    - `payment.captured`: Payment successfully captured and settled.
    - `payment.failed`: Payment attempt failed with `error_code`, `error_description`, `error_source`, `error_step`, `error_reason`.
  - **Payment Link Events**:
    - `payment_link.paid`: Payment link was completely paid; contains `payment_link`, `order`, and `payment` entities.
    - `payment_link.partially_paid`: Partial payment received (when `accept_partial` is enabled).
    - `payment_link.cancelled`: Payment link cancelled by merchant.
    - `payment_link.expired`: Payment link expired based on `expire_by`.
  - **Refund Events**:
    - `refund.created`: Refund initiated.
    - `refund.processed`: Refund credited to customer.
    - `refund.failed`: Refund failed.
- **Implementation Rule**:
  - Parse events using strict Zod schemas.
  - Map `payment.failed` to `RecoveryCase` creation or failure update.
  - Map `payment_link.paid` and `payment.captured` to recovery completion verification.

---

## 4. Payment Link Creation Semantics

- **Official Source**: [Payment Links API Reference](https://razorpay.com/docs/api/payments/payment-links/) | [Create Standard Payment Link](https://razorpay.com/docs/api/payments/payment-links/create-standard)
- **Verified Facts**:
  - Endpoint: `POST /v1/payment_links`.
  - Amount must be passed in **integer minor units** (e.g., 10000 for ₹100.00 INR).
  - Required parameters: `amount` (integer), `currency` (ISO string, e.g., "INR").
  - Key optional parameters: `description`, `customer` (`name`, `email`, `contact`), `notify` (`sms`, `email`, `whatsapp`), `expire_by` (Unix timestamp), `reference_id` (internal correlation ID), `notes` (key-value metadata).
  - Response contains `id` (e.g., `plink_xxx`), `short_url`, `status` (`created`, `paid`, `partially_paid`, `cancelled`, `expired`).
- **Implementation Rule**:
  - Correlate `RecoveryAttempt.id` with `reference_id` or `notes.recovery_attempt_id`.
  - Never allow fractional decimal amounts in API payloads.

---

## 5. Payment Status & Capture Semantics

- **Official Source**: [Payments API Reference](https://razorpay.com/docs/api/payments/) | [Payment Lifecycle](https://razorpay.com/docs/payments/payment-gateway/web-integration/hosted/)
- **Verified Facts**:
  - Status progression: `created` -> `authorized` -> `captured` -> `refunded` (or `failed`).
  - Captured payments have `captured: true` and status `captured`.
  - Uncaptured payments in `authorized` state will auto-refund or expire after capture window (default 5 days or merchant setting).
- **Implementation Rule**:
  - A recovery case is considered **recovered** ONLY upon verified `captured: true` status with matching amount and currency.
  - No recovery claim can be made on `authorized`-only state until capture confirmation is recorded.

---

## 6. Refunds & Idempotency

- **Official Source**: [Refunds API Reference](https://razorpay.com/docs/api/refunds/) | [Create Normal Refund](https://razorpay.com/docs/api/refunds/create-normal)
- **Verified Facts**:
  - Endpoint: `POST /v1/payments/{payment_id}/refund`.
  - Payload parameters: `amount` (integer minor units; optional for full refund), `speed` (`normal` | `optimum`), `notes`, `receipt`.
  - Idempotent request support: Header `X-Razorpay-Idempotency-Key` or idempotency parameter.
  - Response contains `id` (`rfnd_xxx`), `payment_id`, `amount`, `status` (`processed`, `pending`, `failed`).
- **Implementation Rule**:
  - `RefundTask` stores a unique `idempotencyKey` UUID.
  - All automated and manual refund requests must submit the `idempotencyKey`.

---

## 7. Test Mode Availability & Constraints

- **Official Source**: [Test and Live Modes](https://razorpay.com/docs/payments/dashboard/test-live-modes/)
- **Verified Facts**:
  - Test mode operates as a sandbox replica of live environment.
  - Separate API keys exist: `rzp_test_...` (Test) vs `rzp_live_...` (Live).
  - No real money is transferred in test mode.
  - Webhook test OTP for setup and verification is `754081`.
  - Webhook payloads share identical JSON schemas across Test and Live modes.
- **Implementation Rule**:
  - SECONDWIND console uses verified Test Mode transactions as evidence of recovery execution.

---

## 8. Test Error / Failure Simulation

- **Official Source**: [Razorpay Payments Sandbox & Test Cards](https://razorpay.com/docs/payments/payment-gateway/web-integration/hosted/test-card-details/)
- **Verified Facts**:
  - Razorpay provides test card numbers and simulated checkout failure reasons in Test Mode.
  - Test mode failure webhook events emit identical structures with error blocks (`error_code`, `error_description`, `error_reason`, `error_step`, `error_source`).
- **Implementation Rule**:
  - In automated test suites, do not hardcode real payment cards; use verified sandbox constructs or mock injectors for offline tests.

---

## 9. Verified Gemini Model Identifier

- **Official Source**: [Google AI for Developers - Gemini Models](https://ai.google.dev/gemini-api/docs/models/gemini)
- **Verified Fact**:
  - Current verified model identifier for general multi-turn reasoning and agentic analysis: `gemini-3.7-flash` (recommended) and `gemini-2.5-flash` / `gemini-2.5-pro`.
  - Verified from official Google AI developer documentation.
- **Implementation Rule**:
  - Hardcode only the officially verified model identifier: `const GEMINI_MODEL = "gemini-3.7-flash";`.

---

## 10. Unverified Behaviors & Safe Manual-Review Paths

| Area | Status | Safe Fallback / Manual Review Path |
| :--- | :--- | :--- |
| **Instant Refund Fallback** | `UNVERIFIED` (Whether instant refund falls back to normal refund automatically across all banking networks without extra merchant configuration) | Require `speed: "normal"` by default. If instant refund fails with code `INSTANT_REFUND_NOT_AVAILABLE`, flag `RefundTask` for manual operator review. |
| **Late Authorization Auto-Capture on Expired Links** | `UNVERIFIED` (Exact timing window for late authorizations completed after `expire_by` on edge UPI networks) | Any `payment.captured` event received for a `RecoveryCase` in `EXPIRED` status must be routed to `MANUAL_REVIEW` audit queue rather than auto-closed without operator confirmation. |
| **Webhook Delivery Max Retries Schedule** | `UNVERIFIED` (Exact backoff timing curve across all tier 1 and tier 2 outage scenarios) | Implement internal reconciliation polling job for open `RecoveryCase` items older than 30 minutes to verify provider status directly. |

---

*Contract last updated and verified against official Razorpay & Google AI docs: August 2026.*
