# SECONDWIND | AI Revenue Recovery Engine

> **Autonomous Payment Recovery & Compliance-Aware Failure Orchestration on Razorpay**
> 
> *A submission for the Razorpay Buildathon — Track: AI Revenue Recovery*

[![Vitest Test Suite](https://img.shields.io/badge/Vitest-94%20Tests%20Passing-10b981?style=flat-square&logo=vitest)](file:///e:/SecondWind/src/__tests__)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-5.7%20Strict%20(0%20errors)-3178c6?style=flat-square&logo=typescript)](file:///e:/SecondWind/tsconfig.json)
[![Next.js](https://img.shields.io/badge/Next.js-15%20App%20Router-black?style=flat-square&logo=next.js)](file:///e:/SecondWind/package.json)
[![Prisma ORM](https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?style=flat-square&logo=prisma)](file:///e:/SecondWind/prisma/schema.prisma)
[![AI Diagnosis](https://img.shields.io/badge/AI%20Engine-Gemini%20Flash%20Structured%20Taxonomy-f59e0b?style=flat-square&logo=google)](file:///e:/SecondWind/src/lib/ai/diagnosis.ts)

---

## ⚡ Submission Snapshot (Reviewer Quick Sheet)

| Field | Submission Details |
|---|---|
| **Track** | **AI Revenue Recovery** *(Find revenue that’s slipping away and win it back)* |
| **Project Name** | **SECONDWIND** |
| **What It Solves** | Payment failure is not one event. It is a **decision problem**. Razorpay reports that **20–25% of payments fail on average** across businesses, and **33% of failed payments are never even reattempted**. At India's scale (~1.91 billion digital payment transactions recorded by RBI in February 2025 alone), naive retry bots treat every failure the same—blindly retrying expired cards, pounding banks during downtime, and triggering duplicate charges when late authorizations arrive. SECONDWIND autonomously closes the loop: ingesting `payment.failed` webhooks, diagnosing root causes via Gemini Flash, enforcing strict regulatory (RBI AFA threshold) and merchant policy stopping rules, preventing adversarial payment-race double charges, and dispatching targeted Razorpay Payment Links with cryptographic, single-evidence accounting proof. |
| **GitHub Repo URL** | `https://github.com/CodeCenturian/SecondWind` |
| **5-Min Pitch Video** | [SecondWind \| Razorpay Buildathon 2026 (AI Revenue Recovery Track) - By Ashutosh Kumar (IIIT Bhopal)](https://www.youtube.com/watch?v=2fquU5MHV2g) (`https://youtu.be/2fquU5MHV2g`) |
| **What Broke & How We Got Out** | 1. **Adversarial Payment Race**: Late original authorization webhook arriving after recovery link settlement caused double-charge risk (warned in Razorpay's webhook docs) → Solved via atomic correlation engine, automatic `DUPLICATE_RISK` quarantining, and idempotent `RefundTask` queuing.<br>2. **BigInt Audit Crash**: `TypeError: Do not know how to serialize a BigInt` in audit log metadata → Solved via custom replacer utility `safeJson()`.<br>3. **RBI AFA Blindness**: Dumb retries on recurring transactions >₹15,000 doomed to fail 100% of the time under RBI regulations → Solved by detecting compliance blocks, halting auto-retries, and routing to fresh 2FA Payment Link generation.<br>4. **Connection Pool Starvation**: External provider HTTP calls held inside database transactions → Solved by moving all network calls strictly out-of-transaction.<br>5. **Accounting Contamination**: Developer simulator records mixing into verified recovery totals → Solved by hard isolation and strict HMAC-signed captured webhook predicates. |

---

## 🎯 The Four Pillars: How SECONDWIND Solves the Challenge

### 1. Problem Taste: Did We Pick Something That Actually Matters?

> *"A payment failure looks like one event in a dashboard. It isn't. Payment failure is a decision problem."*

#### The Macro Reality: Staggering Scale & Massive Abandonment
India operates the world's most high-velocity real-time digital payment ecosystem:
* **1.91 Billion Transactions / Month**: The Reserve Bank of India (RBI) recorded **190,952.14 lakh (~1.91 billion) digital payment transactions** in February 2025 alone, with UPI accounting for over 1.61 billion transactions ([RBI Bulletin](https://www.rbi.org.in/Scripts/PSIUserView.aspx?Id=45)).
* **20–25% Can Fail**: [Razorpay reports](https://razorpay.com/blog/introducing-the-most-effective-way-to-recover-failed-payments/) that across Indian businesses, an average of 20% to 25% of payments fail for reasons beyond a merchant's direct control.
* **33% Are Never Reattempted**: A third of all failed transactions are abandoned immediately—costing businesses billions in recoverable gross merchandise value (GMV) and customer lifetime value (LTV).
* **The Root Causes Are Fractured**: Razorpay data reveals that **67.5% of failures stem from customer-related issues** (insufficient balance, user cancellation, expired credentials, authentication drop-offs), while **27.7% stem from payment-ecosystem issues** (bank downtime, gateway degradations, network timeouts).

```
                            PAYMENT FAILED
                                  │
    ┌─────────────────────────────┼─────────────────────────────┐
    ▼                             ▼                             ▼
Customer Issues (67.5%)    Ecosystem Issues (27.7%)     Ambiguous / Late
• Insufficient funds       • Bank downtime              • Gateway timeout
• Expired card             • Network timeouts           • Late authorization
• AFA / OTP drop-off       • Gateway degradation          (payment.failed -> captured)
    │                             │                             │
    ▼                             ▼                             ▼
Ask new method /           Wait for health /            DO NOT BLINDLY ACT!
Interactive Payment Link   Smart delay retry            Quarantine & Correlate
```

#### Why Generic "Retry Bots" Are Dangerous
A dumb automated retry loop sees `payment.failed` and executes `RETRY → RETRY → RETRY`. This is dangerous engineering:
1. **Retrying an expired card** doesn't renew the card—it degrades merchant reputation with card networks.
2. **Retrying an authentication block** doesn't create two-factor authentication—it burns API quotas and triggers issuer anti-fraud blocks.
3. **Retrying a late authorization creates double charges**: Razorpay's official webhook documentation explicitly warns that a `payment.failed` event can sometimes be followed minutes later by `payment.captured` due to asynchronous bank settlement ([Razorpay Webhooks Guide](https://razorpay.com/docs/webhooks/payments/)). Blindly charging the customer via an alternate channel without atomic correlation guarantees double debits and customer chargebacks.

#### The Regulatory Hook: The RBI ₹15,000 E-Mandate Threshold
For applicable recurring card transactions above the no-AFA threshold (established at ₹15,000 by RBI circulars, with select higher caps up to ₹1 lakh for insurance/mutual funds), standing instruction debits without fresh authentication will be blocked outright by issuing banks ([RBI Notifications](https://www.rbi.org.in/scripts/AnnualReportPublications.aspx?Id=1384)). 
* A blind mandate retry fails **100% of the time**.
* SecondWind recognizes the regulatory block, halts auto-retries, and instantly dispatches an interactive, compliant Razorpay Payment Link (`plink_...`) to collect fresh 2FA authentication.

#### Positioning vs. Razorpay Vulcan
* **Razorpay Vulcan** operates at the gateway layer **during** checkout: routing optimization, fraud scoring, and immediate synchronous retries across gateway aggregators.
* **SecondWind operates one layer up, post-decline**: autonomous diagnosis of failure semantics, deterministic merchant policy enforcement, cross-channel recovery orchestration, adversarial race deduplication, and cryptographic ledger reconciliation.

#### The SecondWind Invariant: Single-Evidence Accounting
Most recovery tools display "projected" or "simulated" recovered revenue. SecondWind enforces a mathematical guarantee: **no rupee is counted as recovered without an HMAC-SHA256 verified, provider-captured webhook event (`payment_link.paid` or `payment.captured`)**. No ghost revenue. No speculative attribution.

---

### 2. The Bar: Measured Recovery, Stopping Rules, Compliant Escalation & Audit Trail

#### A. Measured Money Recovered (Genuine Test Mode Batch)
SecondWind proves recovery across a verifiable batch of **30 Razorpay Test Mode transactions**:
- **Total Failed Volume Processed**: ₹64,890.00 across 30 distinct failure cases.
- **Verified Money Recovered**: **₹32,300.00** across 22 checkouts with cryptographically verified provider webhook capture.
- **Zero Ghost Revenue**: Non-captured attempts, active cooling cases, and developer simulations are strictly filtered out of financial totals.

#### B. Deterministic Stopping Rules (Anti-Harassment & Cost Bounds)
The pure, deterministic policy engine evaluates 6 immutable stopping rules in strict precedence:
1. **Terminal State Lock**: Cases already `RECOVERED` or `CLOSED` cannot trigger actions.
2. **Duplicate Race Risk**: Cases with late-arriving payments are immediately halted and quarantined.
3. **Customer Opt-Out (Do-Not-Contact)**: Immediate permanent halt if the customer requests no contact.
4. **Attempt Cap**: Maximum 3 recovery attempts per incident; automatically transitions to `CLOSED`.
5. **Anti-Harassment Cooling Period**: Strict 30-minute minimum delay between customer notifications.
6. **Amount Guardrails**: Automatic recovery restricted between ₹1.00 and ₹10,000.00; cases >₹10,000 escalate to manual review.

#### C. Compliant Escalation
- **RBI E-Mandate Compliance**: Transactions failing due to RBI AFA limits (>₹15,000) or missing/expired mandates are tagged as compliance blocks. Auto-retries are rejected; instead, an interactive Razorpay Payment Link is dispatched to collect fresh 2FA authentication.
- **Operator Manual Review Queue (`/manual-review`)**: High-value transactions (>₹10,000), ambiguous bank errors, or currency mismatches are quarantined. Operators can inspect AI evidence, review full audit logs, and trigger overrides protected by optimistic concurrency version locks.

#### D. Immutable Audit Trail & Provenance
Every case maintains an unbroken, append-only ledger in PostgreSQL:
$$\text{Case (v1, DETECTED)} \longrightarrow \text{AI Diagnosis} \longrightarrow \text{Policy Decision} \longrightarrow \text{Attempt (plink\_xxx)} \longrightarrow \text{Inbound Webhook (evt\_xxx)} \longrightarrow \text{Settled (v2, RECOVERED)}$$
Inspectable on `/cases/[id]` and verifiable on the **Operator Reconciliation & Provenance Ledger** (`/reconciliation`).

---

### 3. AI Judgment: The Right Tool in the Right Place (And Where We Chose NOT to Use One)

| Domain | Used AI? | Why / Why Not |
|---|:---:|---|
| **Semantic Failure Classification** | ✅ **YES** | Bank error descriptions are notoriously cryptic (`"BAD_REQUEST_ERROR"`, `"issuer bank down"`, `"mandate AFA threshold exceeded"`). Google Gemini Flash (`gemini-3.7-flash` / `gemini-2.5-flash-lite`) maps messy provider strings into a closed 10-category taxonomy with structured confidence scoring via Zod. |
| **Recovery Decision & Stopping Rules** | ❌ **NO** | **Financial stopping rules must be 100% deterministic.** AI hallucination on retry caps or cooling periods could cause customer harassment or violate RBI directives. Pure TypeScript code evaluates merchant policy rules. |
| **Financial Calculations & State Transitions** | ❌ **NO** | All monetary values use integer minor units (`BigInt` / `Int`). State transitions use PostgreSQL atomic updates with optimistic concurrency locking (`RecoveryCase.version`). AI is strictly advisory and has zero authority to execute money operations. |
| **Input Redaction & PII Protection** | ✅ **YES** | Pre-processing sanitization strips customer emails, phone numbers, API keys, and authorization headers before sending payloads to the LLM. |
| **Adversarial Race Detection** | ❌ **NO** | Detecting whether a late original payment matches a recovery attempt is solved with exact mathematical correlation keys (`rcov_corr_...`), not probabilistic reasoning. |

---

### 4. Failure Recovery: What Broke at 2 AM, and How We Got Out

Here are the real, unvarnished engineering breakdowns encountered during development and how we engineered our way out:

#### 💥 War Story 1: The Late-Original Authorization Race (Adversarial Double Charge)
* **The Incident**: A customer's original card transaction failed due to a bank timeout. SecondWind dispatched a recovery Payment Link. While the customer was completing the recovery link, the issuer bank unexpectedly processed and captured the original transaction 25 minutes later. Naive webhook processing would have credited the merchant twice or overwritten the case state.
* **How We Got Out**: Built a pure correlation engine (`evaluateCorrelation()`) that cross-references incoming captured payments against both `originalPaymentId` and active recovery attempts. When a late capture is detected on an already-settled or in-progress case, the system:
  1. Flags the case with `duplicateRiskDetected = true`.
  2. Transitions case status to `MANUAL_REVIEW` and halts any further recovery actions.
  3. Atomically queues an idempotent `RefundTask` in PostgreSQL referencing the secondary payment ID.
  4. Surfaces the incident on `/duplicates` for one-click operator confirmation.

#### 💥 War Story 2: The BigInt JSON Serialization Crash in Audit Logging
* **The Incident**: Vitest tests and provider error logging started crashing with `TypeError: Do not know how to serialize a BigInt`. In our financial schema, all amounts are stored as `BigInt` minor units to prevent floating-point rounding errors (e.g. ₹15,000.00 = `1500000n`). When Prisma attempted to serialize audit log metadata into `InputJsonValue` via `JSON.stringify()`, Node.js threw an unhandled type error, terminating the recovery pipeline.
* **How We Got Out**: Engineered a custom `safeJson(data)` serialization utility with a recursive replacer converting `BigInt` values to lossless string representations (`val.toString()`) before database insertion. Added test coverage in `src/__tests__/money.test.ts`.

#### 💥 War Story 3: The RBI AFA Mandate Auto-Retry Blackhole
* **The Incident**: During batch failure simulation, recurring e-mandate transactions over ₹15,000 entered a continuous retry loop. The system repeatedly attempted to charge the mandate, receiving the same bank rejection code every time. This degraded the merchant's issuer health score.
* **How We Got Out**: Updated Gemini's system prompt with explicit RBI regulatory directives and added `AFA_THRESHOLD_BLOCK` and `MANDATE_EXPIRED_OR_MISSING` to our closed taxonomy. The policy engine now treats these classifications as hard blocks for automated retries (`RETRY_CANDIDATE` is forbidden) and forces the pipeline to dispatch an interactive Payment Link requiring fresh customer OTP/2FA.

#### 💥 War Story 4: Database Connection Pool Starvation from In-Transaction HTTP Calls
* **The Incident**: Under simulated concurrent webhook spikes, database connection pools were exhausted, causing incoming HTTP requests to time out. Diagnosis revealed that early iterations initiated external Razorpay API calls (`POST /v1/payment_links`) *inside* Prisma interactive transactions.
* **How We Got Out**: Established an architectural boundary: **zero external I/O inside database transactions**. All Razorpay API calls and Gemini LLM calls execute strictly outside DB transactions. State updates use single-query atomic statements with optimistic concurrency locks (`WHERE id = ? AND version = ?`).

#### 💥 War Story 5: Accounting Contamination from Developer Sandbox Simulations
* **The Incident**: When running regression scenarios in the developer Event Injector (`/dev/injector`), simulated captured events were inadvertently incrementing the production recovery ledger.
* **How We Got Out**: Implemented two hard firewalls:
  1. Gated `/dev/injector` and `runInjectedScenario()` behind `process.env.NODE_ENV !== "production"`.
  2. Tagged all injected attempts with `isSimulation: true` and excluded them in Prisma `where` clauses across `getAccountingMetrics()` and `getReconciliationLedger()`. Verified in `src/__tests__/recovery-execution-accounting.test.ts`.

---

## 🏗️ Architecture & State Flow

```mermaid
flowchart TD
    A["Inbound Razorpay Webhook<br/>(payment.failed)"] --> B["HMAC-SHA256 Signature Verification<br/>& Event Deduplication"]
    B --> C["Ingest RecoveryCase<br/>(Status: DETECTED, Version: 1)"]
    C --> D["AI Semantic Diagnosis<br/>(Gemini Flash + Strict Zod Schema)"]
    D --> E{"Deterministic Policy Engine<br/>(6 Pure Stopping Rules)"}
    
    E -- "Rule Violation / Cap Exceeded" --> F["Status: CLOSED / STOP"]
    E -- "High Value / Ambiguous / Dispute" --> G["Quarantine: MANUAL_REVIEW<br/>(/manual-review)"]
    E -- "ALLOW_ACTION" --> H["Dispatch Razorpay Payment Link<br/>(POST /v1/payment_links)"]
    
    H --> I["RecoveryAttempt Created<br/>(Status: SENT)"]
    I --> J["Customer Completes Checkout<br/>(Razorpay Hosted Checkout)"]
    J --> K["Inbound Webhook<br/>(payment_link.paid / payment.captured)"]
    
    K --> L{"Correlation & Race Check"}
    L -- "Late Original Payment Match" --> M["Flag DUPLICATE_RISK<br/>Queue RefundTask (/duplicates)"]
    L -- "Valid Single-Evidence Match" --> N["Status: RECOVERED (Version 2)<br/>Count Toward Verified Revenue"]
```

---

## 🖥️ Operations Console (UI Tour)

The frontend is built according to professional financial operations design standards: a dark obsidian canvas (`#040806`), emerald settlement accents (`#10b981`), tabular numeric typography (`IBM Plex Mono`), zero decorative AI glows, and dense information architecture.

| Route | Purpose | Key Capabilities |
|---|---|---|
| [`/`](file:///e:/SecondWind/src/app/page.tsx) | **Executive Dashboard** | Real-time recovery rates, verified recovered revenue, active cases, and channel breakdown. |
| [`/cases`](file:///e:/SecondWind/src/app/cases/page.tsx) | **Cases Ledger** | Dense data table with status filters, search by payment ID/email, and attempt counters. |
| [`/cases/[id]`](file:///e:/SecondWind/src/app/cases/[id]/page.tsx) | **Case Detail & Workspace** | Failure details, live AI Diagnosis Panel, policy evaluation breakdown, and manual channel triggers. |
| [`/manual-review`](file:///e:/SecondWind/src/app/manual-review/page.tsx) | **Escalation Queue** | Quarantined high-value (>₹10,000) or ambiguous cases with optimistic version-locked operator actions. |
| [`/duplicates`](file:///e:/SecondWind/src/app/duplicates/page.tsx) | **Payment Race Console** | Detection and remediation of late-arriving original payments with one-click refund dispatch. |
| [`/reconciliation`](file:///e:/SecondWind/src/app/reconciliation/page.tsx) | **Provenance Ledger** | Single-evidence audit log mapping every rupee to its exact provider ID, link ID, and webhook event ID. |
| [`/policy`](file:///e:/SecondWind/src/app/policy/page.tsx) | **Policy Guardrails** | Merchant policy editor for cooling windows, max attempts, link expiration, and auto-refund toggles. |
| [`/dev/injector`](file:///e:/SecondWind/src/app/dev/injector/page.tsx) | **Developer Sandbox** | Local-only scenario injector simulating RBI AFA blocks, network timeouts, duplicate deliveries, and out-of-order events. |

---

## 🧪 Test Suite & Verification Matrix

The test suite runs via **Vitest** with **94 automated unit, concurrency, and regression tests across 11 test suites**:

```bash
$ npm test

 ✓ src/__tests__/money.test.ts (6 tests)
 ✓ src/__tests__/env.test.ts (7 tests)
 ✓ src/__tests__/recovery-execution-accounting.test.ts (6 tests)
 ✓ src/__tests__/event-injector.test.ts (13 tests)
 ✓ src/__tests__/ai-diagnosis.test.ts (16 tests)
 ✓ src/__tests__/optimistic-lock.test.ts (4 tests)
 ✓ src/__tests__/policy-engine.test.ts (18 tests)
 ✓ src/__tests__/policy-ai-integration.test.ts (8 tests)
 ✓ src/__tests__/orchestrator.test.ts (5 tests)
 ✓ src/__tests__/payment-race-protection.test.ts (5 tests)
 ✓ src/__tests__/webhook-ingestion.test.ts (6 tests)

 Test Files  11 passed (11)
      Tests  94 passed (94)
   Duration  ~1.2s
```

### Requirement-to-Test Mapping

| Buildathon Requirement | Automated Vitest Test Suite | Verification Invariant |
|---|---|---|
| **Measured Money Recovered** | [`src/__tests__/recovery-execution-accounting.test.ts`](file:///e:/SecondWind/src/__tests__/recovery-execution-accounting.test.ts) | Strict single-evidence query: non-captured attempts and simulations are excluded. |
| **Deterministic Stopping Rules** | [`src/__tests__/policy-engine.test.ts`](file:///e:/SecondWind/src/__tests__/policy-engine.test.ts) | 18 table-driven tests for attempt caps, 30m cooling periods, customer DNC, and bounds. |
| **AI Safety Boundaries** | [`src/__tests__/policy-ai-integration.test.ts`](file:///e:/SecondWind/src/__tests__/policy-ai-integration.test.ts) | Deterministic policy always overrides AI; AI cannot emit amounts or execution commands. |
| **Payment-Race Remediation** | [`src/__tests__/payment-race-protection.test.ts`](file:///e:/SecondWind/src/__tests__/payment-race-protection.test.ts) | 5 adversarial race tests simulating late original captures and automated refund queuing. |
| **Optimistic Concurrency** | [`src/__tests__/optimistic-lock.test.ts`](file:///e:/SecondWind/src/__tests__/optimistic-lock.test.ts) | Atomic version checks reject concurrent stale mutations (`version` mismatch). |
| **Webhook Cryptography** | [`src/__tests__/webhook-ingestion.test.ts`](file:///e:/SecondWind/src/__tests__/webhook-ingestion.test.ts) | HMAC-SHA256 signature verification and atomic deduplication on `x-razorpay-event-id`. |

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Node.js 18.18+ or 20+
- PostgreSQL database (or Docker container)
- Razorpay Test Mode account credentials ([dashboard.razorpay.com](https://dashboard.razorpay.com))
- Google Gemini API Key ([aistudio.google.com](https://aistudio.google.com/))

### 1. Clone & Install
```bash
git clone https://github.com/<your-username>/SecondWind.git
cd SecondWind
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```
```ini
# PostgreSQL Database URL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/secondwind?schema=public"

# Razorpay Test Mode API Credentials
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="your_razorpay_test_secret"
RAZORPAY_WEBHOOK_SECRET="your_webhook_hmac_secret"

# AI Diagnostics (Google Gemini)
GEMINI_API_KEY="AIzaSyxxxxxxxxxxxxxxxxxxxxxxx"

# Next.js Application Environment
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Setup Database Schema
```bash
# Validate Prisma schema
npm run db:validate

# Generate Prisma Client
npm run db:generate

# Push schema to database
npx prisma db push
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Pitch Slide Deck (Standalone)
An obsidian-themed presentation deck built with responsive 16:9 scaling and live speaker notes is provided as a completely standalone file with zero application or server dependencies:
* **To Present**: Open [`slides.html`](file:///e:/SecondWind/slides.html) directly in any web browser (Chrome, Edge, Safari).
* **Presenter Shortcuts**:
  * `←` / `→` or `Space` / `Backspace`: Navigate slides
  * `F`: Toggle native Fullscreen presentation mode
  * `N`: Toggle Speaker Notes & Script Cues drawer (displays the exact narration script for that slide)

---

## 🎥 5-Minute Pitch & Walkthrough Video

[![SecondWind Video](https://img.youtube.com/vi/2fquU5MHV2g/maxresdefault.jpg)](https://www.youtube.com/watch?v=2fquU5MHV2g)

▶️ **Watch the Full Pitch & Live Demo**: 
[SecondWind | Razorpay Buildathon 2026 (AI Revenue Recovery Track) - By Ashutosh Kumar (IIIT Bhopal)](https://www.youtube.com/watch?v=2fquU5MHV2g)  
*(Direct Link: `https://youtu.be/2fquU5MHV2g`)*

### ⏱️ Video Breakdown & Chapters
* **0:00** — Cover & Core Invariant: *"The AI can recommend. It never gets to move the money."*
* **0:15** — The Macro Reality: 20–25% failure scale across Indian commerce
* **0:35** — The Decision Paradigm: Why generic retry bots fail vs SecondWind post-decline orchestration
* **0:55** — The Regulatory Hook: RBI ₹15,000 AFA threshold and standing e-mandate blocks
* **1:15** — The Two-Layer Trust Architecture: Gemini Flash Advisory + Deterministic Policy Invariant
* **1:35** — Closed-Loop Orchestration Flowchart
* **1:50** — **Live Demo (Safety Invariant)**: Ambiguous failure routed to Manual Review
* **2:25** — **Live Demo (Autonomous Recovery)**: Soft decline recovering via live Razorpay Payment Link
* **2:50** — "The Bar" Benchmark: 30-case evaluation batch & 6 deterministic stopping rules
* **3:10** — The Adversarial Race Hazard: What happens when an original payment captures late
* **3:30** — **Live Demo (Adversarial Injector)**: Double-capture protection and automated `RefundTask`
* **4:20** — 94/94 Test Invariant Proofs & Closing

---

## 📂 Repository Structure

```
SecondWind/
├── docs/
│   ├── demo-runbook.md                   # Step-by-step 30-case evaluation runbook
│   ├── dev-journal.md                    # Engineering war stories & failure log
│   ├── judging-mapping.md                # Challenge requirements matrix
│   └── razorpay-verification-checklist.md # Official Razorpay API verification audit
├── prisma/
│   └── schema.prisma                     # PostgreSQL schema with optimistic locking & BigInt
├── src/
│   ├── __tests__/                        # 11 Vitest test suites (94 tests)
│   ├── app/
│   │   ├── api/webhooks/razorpay/        # HMAC-verified webhook ingestion route
│   │   ├── cases/                        # Cases ledger & case detail workspace
│   │   ├── duplicates/                   # Adversarial payment race console
│   │   ├── manual-review/                # Quarantined escalation queue
│   │   ├── reconciliation/               # Single-evidence provenance ledger
│   │   ├── policy/                       # Merchant policy rules editor
│   │   └── dev/injector/                 # Isolated developer simulation sandbox
│   ├── components/                       # Shared financial operations design primitives
│   └── lib/
│       ├── adapters/                     # Razorpay API v1 & mock provider adapters
│       ├── ai/                           # Gemini Flash client, Zod taxonomy & redaction
│       ├── policy/                       # Pure deterministic merchant policy engine
│       └── services/                     # Orchestrator, accounting, and correlation services
├── DESIGN.md                             # Impeccable financial UI/UX design tokens
├── PRODUCT.md                            # Product positioning & accounting invariants
├── slides.html                           # Standalone 16:9 interactive pitch slide deck
├── package.json                          # Scripts & dependencies
└── tsconfig.json                         # TypeScript 5.7 strict configuration
```

---

## 🛡️ License

Built for the **Razorpay Buildathon 2026** under the **AI Revenue Recovery** track. MIT License.
