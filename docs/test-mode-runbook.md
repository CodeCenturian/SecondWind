# SECONDWIND: Razorpay Test Mode 30-Transaction Recovery Runbook

This runbook defines the verified operator procedure for performing, validating, and recording up to 30 genuine Razorpay Test Mode recovery transactions.

> [!IMPORTANT]
> **Authenticity & Integrity Rule**:
> In accordance with our financial accounting invariants, **no row in this runbook is prepopulated or claimed as recovered until the documented Test Mode checkout flow has actually been performed and verified via an HMAC-signed provider webhook**.
> This runbook is a live, seedable ledger for operators conducting live sandbox validation.

---

## 1. Prerequisites & Environment Setup

1. **Verify Environment Variables** in `.env`:
   - `RAZORPAY_KEY_ID`: `rzp_test_...` (Your Razorpay Test Key)
   - `RAZORPAY_KEY_SECRET`: Razorpay Test Secret
   - `RAZORPAY_WEBHOOK_SECRET`: Configured Webhook Secret for HMAC verification
2. **Start Local Development Server**:
   ```bash
   npm run dev
   ```
3. **Connect Webhook Tunnel (e.g. ngrok or Razorpay Webhook simulator)**:
   - Target URL: `https://<tunnel-domain>/api/webhooks/razorpay`
   - Active Events: `payment.failed`, `payment_link.paid`, `payment.captured`

---

## 2. Standard Operating Procedure (Per Transaction)

### Step A: Ingest Initial Payment Failure (`payment.failed`)
1. Trigger a test checkout failure on your Razorpay storefront or emit a signed `payment.failed` event using Razorpay Test Cards (e.g., `5123 4567 8901 2345` with CVV `123` for insufficient funds simulation).
2. Verify that SECONDWIND creates a `RecoveryCase` in `DETECTED` status (Version 1).

### Step B: Evaluate Policy & Dispatch Recovery Action
1. Open the Case Detail page in SECONDWIND Console: `http://localhost:3000/cases/<caseId>`.
2. (Optional) Run **AI Semantic Diagnosis** to inspect failure classification, evidence, and uncertainties.
3. Review the **Deterministic Policy Engine** outcome (`ALLOW_ACTION`).
4. Select Channel (`PAYMENT_LINK`) and click **Trigger Channel**.
5. SECONDWIND generates an opaque correlation token (`rcov_corr_...`), passes it to Razorpay's API `POST /v1/payment_links`, and persists attempt state as `SENT`.

### Step C: Complete Test Checkout on Razorpay Hosted Link
1. Copy the generated `paymentLinkUrl` (e.g. `https://rzp.io/i/plink_xxx`).
2. Open the link in an incognito window.
3. Complete the checkout using Razorpay Test Mode success credentials:
   - **Test Card**: `4111 1111 1111 1111`, Expiry: `12/30`, CVV: `123`, OTP: `754081`
   - **Test UPI**: `success@razorpay` (or simulated netbanking success).

### Step D: Authoritative Settlement via Inbound Webhook
1. Razorpay emits `payment_link.paid` and `payment.captured` (`captured: true`).
2. SECONDWIND verifies the HMAC-SHA256 signature, matches the correlation token, validates the exact amount/currency, and transitions the case to `RECOVERED` (Version 2).
3. The settled amount is immediately counted under **Verified Test Mode Recovered** on the Dashboard and Reconciliation Ledger.

---

## 3. Seedable 30-Transaction Execution Record

| # | Case ID | Original Payment ID | Failure Reason Code | Dispatched Link ID (`plink_xxx`) | Opaque Correlation Token (`rcov_corr_...`) | Captured Payment ID (`pay_xxx`) | Webhook Event ID (`evt_xxx`) | Amount (INR) | Final Status | Verified At |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | _[Seedable]_ | _[e.g. pay_test_001]_ | `BAD_REQUEST_ERROR` | _[plink_test_001]_ | `rcov_corr_case01_att1_...` | _[pay_test_cap01]_ | _[evt_test_001]_ | ₹1,250.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 02 | _[Seedable]_ | _[e.g. pay_test_002]_ | `INSUFFICIENT_FUNDS` | _[plink_test_002]_ | `rcov_corr_case02_att1_...` | _[pay_test_cap02]_ | _[evt_test_002]_ | ₹2,500.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 03 | _[Seedable]_ | _[e.g. pay_test_003]_ | `GATEWAY_ERROR` | _[plink_test_003]_ | `rcov_corr_case03_att1_...` | _[pay_test_cap03]_ | _[evt_test_003]_ | ₹4,999.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 04 | _[Seedable]_ | _[e.g. pay_test_004]_ | `CARD_EXPIRED` | _[plink_test_004]_ | `rcov_corr_case04_att1_...` | _[pay_test_cap04]_ | _[evt_test_004]_ | ₹850.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 05 | _[Seedable]_ | _[e.g. pay_test_005]_ | `AUTH_FAILED` | _[plink_test_005]_ | `rcov_corr_case05_att1_...` | _[pay_test_cap05]_ | _[evt_test_005]_ | ₹15,000.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 06 | _[Seedable]_ | _[e.g. pay_test_006]_ | `BAD_REQUEST_ERROR` | _[plink_test_006]_ | `rcov_corr_case06_att1_...` | _[pay_test_cap06]_ | _[evt_test_006]_ | ₹3,200.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 07 | _[Seedable]_ | _[e.g. pay_test_007]_ | `INSUFFICIENT_FUNDS` | _[plink_test_007]_ | `rcov_corr_case07_att1_...` | _[pay_test_cap07]_ | _[evt_test_007]_ | ₹720.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 08 | _[Seedable]_ | _[e.g. pay_test_008]_ | `GATEWAY_ERROR` | _[plink_test_008]_ | `rcov_corr_case08_att1_...` | _[pay_test_cap08]_ | _[evt_test_008]_ | ₹1,100.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 09 | _[Seedable]_ | _[e.g. pay_test_009]_ | `USER_ABORTED` | _[plink_test_009]_ | `rcov_corr_case09_att1_...` | _[pay_test_cap09]_ | _[evt_test_009]_ | ₹6,450.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 10 | _[Seedable]_ | _[e.g. pay_test_010]_ | `DAILY_LIMIT_EXCEEDED` | _[plink_test_010]_ | `rcov_corr_case10_att1_...` | _[pay_test_cap10]_ | _[evt_test_010]_ | ₹22,000.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 11 | _[Seedable]_ | _[e.g. pay_test_011]_ | `BAD_REQUEST_ERROR` | _[plink_test_011]_ | `rcov_corr_case11_att1_...` | _[pay_test_cap11]_ | _[evt_test_011]_ | ₹1,800.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 12 | _[Seedable]_ | _[e.g. pay_test_012]_ | `AUTH_FAILED` | _[plink_test_012]_ | `rcov_corr_case12_att1_...` | _[pay_test_cap12]_ | _[evt_test_012]_ | ₹950.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 13 | _[Seedable]_ | _[e.g. pay_test_013]_ | `INSUFFICIENT_FUNDS` | _[plink_test_013]_ | `rcov_corr_case13_att1_...` | _[pay_test_cap13]_ | _[evt_test_013]_ | ₹3,750.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 14 | _[Seedable]_ | _[e.g. pay_test_014]_ | `GATEWAY_ERROR` | _[plink_test_014]_ | `rcov_corr_case14_att1_...` | _[pay_test_cap14]_ | _[evt_test_014]_ | ₹5,200.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 15 | _[Seedable]_ | _[e.g. pay_test_015]_ | `BAD_REQUEST_ERROR` | _[plink_test_015]_ | `rcov_corr_case15_att1_...` | _[pay_test_cap15]_ | _[evt_test_015]_ | ₹12,400.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 16 | _[Seedable]_ | _[e.g. pay_test_016]_ | `CARD_EXPIRED` | _[plink_test_016]_ | `rcov_corr_case16_att1_...` | _[pay_test_cap16]_ | _[evt_test_016]_ | ₹450.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 17 | _[Seedable]_ | _[e.g. pay_test_017]_ | `INSUFFICIENT_FUNDS` | _[plink_test_017]_ | `rcov_corr_case17_att1_...` | _[pay_test_cap17]_ | _[evt_test_017]_ | ₹2,100.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 18 | _[Seedable]_ | _[e.g. pay_test_018]_ | `AUTH_FAILED` | _[plink_test_018]_ | `rcov_corr_case18_att1_...` | _[pay_test_cap18]_ | _[evt_test_018]_ | ₹8,900.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 19 | _[Seedable]_ | _[e.g. pay_test_019]_ | `GATEWAY_ERROR` | _[plink_test_019]_ | `rcov_corr_case19_att1_...` | _[pay_test_cap19]_ | _[evt_test_019]_ | ₹3,400.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 20 | _[Seedable]_ | _[e.g. pay_test_020]_ | `BAD_REQUEST_ERROR` | _[plink_test_020]_ | `rcov_corr_case20_att1_...` | _[pay_test_cap20]_ | _[evt_test_020]_ | ₹1,550.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 21 | _[Seedable]_ | _[e.g. pay_test_021]_ | `INSUFFICIENT_FUNDS` | _[plink_test_021]_ | `rcov_corr_case21_att1_...` | _[pay_test_cap21]_ | _[evt_test_021]_ | ₹6,800.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 22 | _[Seedable]_ | _[e.g. pay_test_022]_ | `USER_ABORTED` | _[plink_test_022]_ | `rcov_corr_case22_att1_...` | _[pay_test_cap22]_ | _[evt_test_022]_ | ₹4,200.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 23 | _[Seedable]_ | _[e.g. pay_test_023]_ | `BAD_REQUEST_ERROR` | _[plink_test_023]_ | `rcov_corr_case23_att1_...` | _[pay_test_cap23]_ | _[evt_test_023]_ | ₹11,000.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 24 | _[Seedable]_ | _[e.g. pay_test_024]_ | `AUTH_FAILED` | _[plink_test_024]_ | `rcov_corr_case24_att1_...` | _[pay_test_cap24]_ | _[evt_test_024]_ | ₹1,350.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 25 | _[Seedable]_ | _[e.g. pay_test_025]_ | `GATEWAY_ERROR` | _[plink_test_025]_ | `rcov_corr_case25_att1_...` | _[pay_test_cap25]_ | _[evt_test_025]_ | ₹9,500.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 26 | _[Seedable]_ | _[e.g. pay_test_026]_ | `INSUFFICIENT_FUNDS` | _[plink_test_026]_ | `rcov_corr_case26_att1_...` | _[pay_test_cap26]_ | _[evt_test_026]_ | ₹2,800.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 27 | _[Seedable]_ | _[e.g. pay_test_027]_ | `CARD_EXPIRED` | _[plink_test_027]_ | `rcov_corr_case27_att1_...` | _[pay_test_cap27]_ | _[evt_test_027]_ | ₹1,950.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 28 | _[Seedable]_ | _[e.g. pay_test_028]_ | `BAD_REQUEST_ERROR` | _[plink_test_028]_ | `rcov_corr_case28_att1_...` | _[pay_test_cap28]_ | _[evt_test_028]_ | ₹18,500.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 29 | _[Seedable]_ | _[e.g. pay_test_029]_ | `AUTH_FAILED` | _[plink_test_029]_ | `rcov_corr_case29_att1_...` | _[pay_test_cap29]_ | _[evt_test_029]_ | ₹3,100.00 | _[Pending / Recovered]_ | _[Timestamp]_ |
| 30 | _[Seedable]_ | _[e.g. pay_test_030]_ | `INSUFFICIENT_FUNDS` | _[plink_test_030]_ | `rcov_corr_case30_att1_...` | _[pay_test_cap30]_ | _[evt_test_030]_ | ₹7,650.00 | _[Pending / Recovered]_ | _[Timestamp]_ |

---

## 4. Verification Checkpoints

Before signing off on any test transaction:
- [ ] HMAC-SHA256 signature verified with constant-time equality
- [ ] Attempt correlation matched by exact `reference_id` or `correlationToken` (never fuzzy amount matching)
- [ ] Provider payload confirmed with `captured: true` and status `"captured"` or `"paid"`
- [ ] Exact currency and amount matched the case specification
- [ ] Case transitioned to `RECOVERED` with immutable audit trail entry (`RECOVERY_VERIFIED_AND_SETTLED`)
- [ ] Dashboard **Verified Test Mode Recovered** incremented by exact settled amount
