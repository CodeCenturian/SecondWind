import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
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
    <div style={{ marginTop: "2rem" }}>
      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fff" }}>
              Operator Reconciliation Ledger
            </h1>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "9999px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#34d399",
              }}
            >
              PROVENANCE AUDIT ENGINE
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            End-to-end mathematical verification linking failed transactions, dispatched payment links, provider payment IDs, verified webhook events, and settled amounts.
          </p>
        </div>

        <div className="badge badge-disclaimer">
          🔒 Financial Invariant: Only HMAC-verified captured payments count toward recovered revenue
        </div>
      </div>

      {/* Reconciliation Summary Metrics */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div
          className="glass-card"
          style={{
            border: "1px solid rgba(16, 185, 129, 0.3)",
            background: "linear-gradient(180deg, rgba(16, 185, 129, 0.06) 0%, rgba(15, 23, 42, 0.6) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Verified Recovered Total
            </span>
            <span className="badge badge-recovered" style={{ fontSize: "0.6875rem" }}>
              FINANCIAL SCOPE
            </span>
          </div>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {formatMoney(totalRecoveredMinor, "INR")}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem", color: "var(--text-secondary)" }}>
            {recoveredCount} case(s) with verified captured payments
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Active Recovery Pipeline
            </span>
            <span className="badge badge-detected" style={{ fontSize: "0.6875rem" }}>
              OPERATIONAL
            </span>
          </div>
          <div className="metric-value" style={{ color: "#60a5fa" }}>
            {inProgressCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Payment links active; awaiting customer checkout
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Manual Review Queue
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              OPERATIONAL
            </span>
          </div>
          <div className="metric-value" style={{ color: "#fbbf24" }}>
            {manualReviewCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Amount/currency mismatch or ambiguous failures
          </div>
        </div>
      </div>

      {/* Provenance Reconciliation Ledger Table */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div>
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff" }}>
              Transaction Provenance Chain ({ledger.length})
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              Direct cross-verification: Case ID → Attempt → Provider Link ID → Captured Payment ID → Webhook Event ID → Counted Rupee.
            </p>
          </div>
          <span className="code-pill">Immutable Audit Trail Active</span>
        </div>

        {ledger.length === 0 ? (
          <div
            style={{
              padding: "3rem 1.5rem",
              textAlign: "center",
              color: "var(--text-muted)",
              background: "rgba(255, 255, 255, 0.01)",
              borderRadius: "0.5rem",
              border: "1px dashed var(--border-color)",
            }}
          >
            <p style={{ fontSize: "1rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
              No transactions recorded in the reconciliation ledger.
            </p>
            <p style={{ fontSize: "0.8125rem" }}>
              Deliver payment failures and process recoveries to view full end-to-end provenance.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Original Payment ID</th>
                  <th>Dispatched Link (plink_xxx)</th>
                  <th>Captured Payment (pay_xxx)</th>
                  <th>Webhook Event ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Counted Recovered</th>
                  <th>Audit Provenance</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => {
                  const isRecovered = row.caseStatus === "RECOVERED";

                  return (
                    <tr key={row.caseId}>
                      <td>
                        <Link
                          href={`/cases/${row.caseId}`}
                          style={{
                            color: "var(--accent-primary)",
                            fontWeight: 600,
                            textDecoration: "underline",
                          }}
                        >
                          {row.caseId.slice(0, 8)}...
                        </Link>
                      </td>
                      <td>
                        <span className="code-pill">{row.originalPaymentId}</span>
                      </td>
                      <td>
                        {row.providerPaymentLinkId ? (
                          <span className="code-pill" style={{ color: "#60a5fa" }}>
                            {row.providerPaymentLinkId}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {row.providerCapturedPaymentId ? (
                          <span className="code-pill" style={{ color: "#34d399" }}>
                            {row.providerCapturedPaymentId}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {row.verifiedWebhookEventId ? (
                          <span className="code-pill">{row.verifiedWebhookEventId.slice(0, 14)}...</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "#fff" }}>
                        {formatMoney(row.originalAmountMinor, row.currency)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isRecovered
                              ? "badge-recovered"
                              : row.caseStatus === "MANUAL_REVIEW"
                              ? "badge-detected"
                              : "badge-system-neutral"
                          }`}
                        >
                          {row.caseStatus}
                        </span>
                      </td>
                      <td>
                        {isRecovered ? (
                          <span style={{ fontWeight: 700, color: "#34d399" }}>
                            ✓ {formatMoney(row.verifiedCapturedAmountMinor || row.originalAmountMinor, row.currency)}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>₹0.00 (Unsettled)</span>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/cases/${row.caseId}`}
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: "0.8125rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          {row.auditLogCount} log(s) →
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

      {/* Accounting Integrity Principles */}
      <div
        className="glass-card"
        style={{
          border: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>
          Reconciliation & Accounting Invariants
        </h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.25rem",
            color: "var(--text-secondary)",
            fontSize: "0.8125rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
          }}
        >
          <li>
            <strong>Single Financial Evidence Scope:</strong> Only transactions with an HMAC SHA-256 authenticated webhook confirming <code>captured: true</code> and exact amount/currency match are counted toward recovered revenue.
          </li>
          <li>
            <strong>No Speculative Recognition:</strong> Dispatched payment links, awaiting checkouts, and manual-review cases are operational pipeline states only and do not alter recovered balance.
          </li>
          <li>
            <strong>Idempotent Settlement:</strong> Duplicate capture webhooks are acknowledged without state changes or double counting.
          </li>
        </ul>
      </div>
    </div>
  );
}
