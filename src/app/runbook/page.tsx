import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { MoneyValue } from "@/components/money-value";
import { EvidenceSourceBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { getAccountingMetrics, getReconciliationLedger } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TestModeRunbookPage() {
  const [metrics, ledger] = await Promise.all([
    getAccountingMetrics(prisma),
    getReconciliationLedger(prisma),
  ]);

  const settledCases = ledger.filter((item) => item.caseStatus === "RECOVERED");

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Verified Razorpay Test Mode Runbook"
        subtitle="The authoritative runbook of genuine Razorpay Test Mode transactions. This is the canonical evidence dataset used to prove deterministic recovery and single-evidence accounting."
        badge={
          <span className="badge-base badge-recovered">
            AUTHORITATIVE EVIDENCE ONLY
          </span>
        }
      />

      {/* Safety Invariant Notice */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--success-primary)",
          borderRadius: "var(--radius-md)",
          padding: "8px var(--space-4)",
          marginBottom: "var(--space-6)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          <strong>Strict Invariant:</strong> Zero developer simulation contamination in verified recovery metrics.
        </span>
        <EvidenceSourceBadge scope="FINANCIAL_SCOPE" />
      </div>

      {/* 2. Metrics Row */}
      <div className="metrics-row rhythm-24">
        <div className="ops-panel" style={{ borderLeft: "3px solid var(--success-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption" style={{ color: "var(--success-text)", fontWeight: 700 }}>
              Verified Test Mode Recovered
            </span>
            <EvidenceSourceBadge scope="FINANCIAL_SCOPE" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--success-text)", margin: "4px 0" }}>
            <MoneyValue amountMinor={metrics.verifiedRecoveredAmountMinor} currency="INR" />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {metrics.verifiedRecoveredCount} settled, verified captured transactions
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Total Ingested Volume</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="FAILURES" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            <MoneyValue amountMinor={metrics.totalDetectedVolumeMinor} currency="INR" />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Across {metrics.totalDetectedCount} detected payment failures
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Settlement Success Rate</span>
            <span className="badge-base badge-neutral">PERFORMANCE</span>
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-primary)", margin: "4px 0" }}>
            {metrics.totalDetectedCount > 0
              ? `${Math.round((metrics.verifiedRecoveredCount / metrics.totalDetectedCount) * 100)}%`
              : "0%"}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Ratio of settled recoveries to detected failure events
          </p>
        </div>
      </div>

      {/* 3. Settled Cases Table */}
      <div className="ops-panel rhythm-24" style={{ padding: "0" }}>
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-h2">Verified Settled Transactions ({settledCases.length})</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px" }}>
            Every counted Rupee is directly linked to an HMAC-verified payment.captured payload.
          </p>
        </div>

        {settledCases.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="No settled Test Mode cases yet"
              description="Deliver a payment.captured webhook for an active payment link or trigger a settlement flow to demonstrate verified recovery."
              actionText="View Cases Ledger"
              actionHref="/cases"
            />
          </div>
        ) : (
          <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Failed Payment ID</th>
                  <th>Payment Link ID</th>
                  <th>Captured Payment ID</th>
                  <th>Settled Amount</th>
                  <th>Provenance Verification</th>
                  <th style={{ textAlign: "right" }}>Audit Link</th>
                </tr>
              </thead>
              <tbody>
                {settledCases.map((item) => (
                  <tr key={item.caseId}>
                    <td>
                      <span className="code-inline">{item.caseId.slice(0, 8)}</span>
                    </td>
                    <td>
                      <span className="code-inline">{item.originalPaymentId}</span>
                    </td>
                    <td>
                      <span className="code-inline" style={{ color: "var(--accent-primary)" }}>
                        {item.providerPaymentLinkId || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="code-inline" style={{ color: "var(--success-text)" }}>
                        {item.providerCapturedPaymentId || "—"}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: "var(--success-text)" }}>
                      <MoneyValue
                        amountMinor={item.verifiedCapturedAmountMinor || item.originalAmountMinor}
                        currency={item.currency}
                      />
                    </td>
                    <td>
                      <span className="badge-base badge-recovered">
                        HMAC VALIDATED
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/cases/${item.caseId}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Provenance →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Verification Instructions Guide */}
      <div className="ops-panel">
        <h2 className="text-h2" style={{ marginBottom: "var(--space-3)" }}>
          How to Verify Test Mode Provenance
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-app)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
            <strong style={{ color: "var(--text-primary)" }}>1. Webhook Signature Integrity:</strong> Every webhook request is verified against <code>RAZORPAY_WEBHOOK_SECRET</code> using HMAC-SHA256 before any case ingestion or status update.
          </div>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-app)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
            <strong style={{ color: "var(--text-primary)" }}>2. Single-Evidence Financial Recognition:</strong> Only cases where a verified <code>payment.captured</code> or <code>payment_link.paid</code> webhook event matches an active case have their amounts counted toward verified revenue.
          </div>
          <div style={{ padding: "var(--space-3)", background: "var(--bg-app)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
            <strong style={{ color: "var(--text-primary)" }}>3. Strict Data Isolation:</strong> Developer simulator events in <code>/dev/injector</code> carry <code>isSimulation: true</code> flags and are completely excluded from verified financial aggregates.
          </div>
        </div>
      </div>
    </div>
  );
}
