# SECONDWIND

> Razorpay payment-recovery operations console for high-volume merchant failure orchestration, autonomous recovery campaigns, and idempotent webhook reconciliation.

---

## Architecture & Recovery Evidence Model

### Verified Provider Evidence as Ground Truth
In SECONDWIND, all recovery verification, state transitions, and batch reconciliation rely strictly on **verified Razorpay Test Mode (or Live Mode) provider events**:
1. **Evidence-Based Recovery**: A payment recovery case (`RecoveryCase`) is NEVER marked as `RECOVERED` based on heuristics or assumptions. It requires cryptographic signature verification of an authentic webhook event (`payment_link.paid` or `payment.captured`) with matching amount, currency, and entity IDs, or direct synchronous provider status confirmation.
2. **Deterministic State Reconciliation**: Webhook event processing enforces strict deduplication via unique `x-razorpay-event-id` database constraints and optimistic concurrency control (`RecoveryCase.version`) to prevent race conditions during concurrent recovery attempts.
3. **Developer Event Injector**: The local Event Injector tooling is strictly **developer-only regression testing tooling** designed to simulate complex failure cascades, network timeouts, and out-of-order webhook delivery. In production and stage environments, only provider-signed webhook deliveries and direct provider API calls constitute valid financial evidence.

---

## Tech Stack & Design Principles

- **Framework**: Next.js 15 (App Router, Server-Only secrets)
- **Language**: TypeScript 5.7+ (Strict Mode enabled)
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Financial Precision**: All monetary values stored and processed as integer minor units (`BigInt` / `Int`)
- **Validation**: Strict Zod schemas for runtime environment and payload verification
- **Testing**: Vitest test runner with unit, concurrency, and schema regression suites

---

## Quickstart & Commands

```bash
# Install dependencies
npm install

# Validate Prisma schema
npx prisma validate

# Generate Prisma Client
npm run db:generate

# Run test suite
npm run test

# Run development server
npm run dev
```

---

## Integration Contracts & References

- [Razorpay Verification Checklist](docs/razorpay-verification-checklist.md)
- [Development Journal](docs/dev-journal.md)
