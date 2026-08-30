import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { MoneyValue } from "@/components/money-value";
import { CaseStateBadge, EvidenceSourceBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { getReconciliationLedger } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const ledger = await getReconciliationLedger(prisma);

  const totalRecoveredMinor = ledger
    .filter((item) => item.caseStatus === "RECOVERED")
    .reduce((acc, curr) => acc + (curr.verifiedCapturedAmountMinor || curr.originalAmountMinor), 0n);

  const recoveredCount = ledger.filter((item) => item.caseStatus === "RECOVERED").length;
  const inProgressCount = ledger.filter((item) => item.caseStatus === "IN_PROGRESS").length;
  const manualReviewCount = ledger.filter((item) => item.caseStatus === "MANUAL_REVIEW").length;

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Operator Reconciliation & Provenance Ledger"
        subtitle="Cryptographically verified mathematical proof linking detected payment failures, outbound recovery payment links, provider payment IDs, verified webhook payloads, and settled ledger amounts."
        badge={
          <span className="badge-base badge-recovered">
            ● Strict HMAC Verification
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
          <strong>Single-Evidence Financial Invariant:</strong> Only HMAC-verified captured recovery payments count toward recovered revenue.
        </span>
        <span className="code-inline">Zero Simulation Contamination</span>
      </div>

      {/* 2. Metrics Row */}
      <div className="metrics-row rhythm-24">
        <div className="ops-panel" style={{ borderLeft: "3px solid var(--success-primary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption" style={{ color: "var(--success-text)", fontWeight: 700 }}>
              Verified Recovered Total
            </span>
            <EvidenceSourceBadge scope="FINANCIAL_SCOPE" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--success-text)", margin: "4px 0" }}>
            <MoneyValue amountMinor={totalRecoveredMinor} currency="INR" />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {recoveredCount} case(s) with verified captured recovery payments
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Active Recovery Pipeline</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="PIPELINE" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-primary)", margin: "4px 0" }}>
            {inProgressCount}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Active payment links awaiting customer payment
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Manual Review Queue</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="HELD" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--warning-text)", margin: "4px 0" }}>
            {manualReviewCount}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Amount/currency mismatch or ambiguous failure codes
          </p>
        </div>
      </div>

      {/* 3. Provenance Chain Table */}
      <div className="ops-panel" style={{ padding: "0" }}>
        <div
          style={{
            padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          <div>
            <h2 className="text-h2">Transaction Provenance Verification Chain ({ledger.length})</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px" }}>
              Case ID → Attempt → Provider Link ID → Captured Payment ID → Webhook Event ID → Counted Rupee.
            </p>
          </div>
          <span className="code-inline">Immutable Provenance Active</span>
        </div>

        {ledger.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="No reconciliation records found"
              description="No transaction chains have been recorded yet. Ingest a webhook or simulate a scenario in the Developer Sandbox."
              actionText="Open Event Injector"
              actionHref="/dev/injector"
            />
          </div>
        ) : (
          <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Failed Payment ID</th>
                  <th>Recovery Link ID</th>
                  <th>Captured Payment ID</th>
                  <th>Captured Event ID</th>
                  <th>Original Amount</th>
                  <th>Verified Amount</th>
                  <th>Case Status</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item) => {
                  const isSettled = item.caseStatus === "RECOVERED";

                  return (
                    <tr key={item.caseId}>
                      <td>
                        <span className="code-inline">{item.caseId.slice(0, 8)}</span>
                      </td>
                      <td>
                        <span className="code-inline">{item.originalPaymentId}</span>
                      </td>
                      <td>
                        {item.providerPaymentLinkId ? (
                          <span className="code-inline" style={{ color: "var(--accent-primary)" }}>
                            {item.providerPaymentLinkId}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {item.providerCapturedPaymentId ? (
                          <span className="code-inline" style={{ color: "var(--success-text)" }}>
                            {item.providerCapturedPaymentId}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {item.verifiedWebhookEventId ? (
                          <span className="code-inline" style={{ fontSize: "0.6875rem" }}>
                            {item.verifiedWebhookEventId.slice(0, 10)}...
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        <MoneyValue amountMinor={item.originalAmountMinor} currency={item.currency} />
                      </td>
                      <td style={{ fontWeight: 700, color: isSettled ? "var(--success-text)" : "var(--text-muted)" }}>
                        {item.verifiedCapturedAmountMinor !== null ? (
                          <MoneyValue amountMinor={item.verifiedCapturedAmountMinor} currency={item.currency} />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <CaseStateBadge status={item.caseStatus} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/cases/${item.caseId}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Audit Case →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
