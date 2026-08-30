import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getAccountingMetrics, getReconciliationLedger } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TestModeRunbookPage() {
  const [metrics, ledger] = await Promise.all([
    getAccountingMetrics(prisma),
    getReconciliationLedger(prisma),
  ]);

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Header */}
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
              Verified Test Mode Runbook & Evidence
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
              AUTHORITATIVE EVIDENCE ONLY
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            The canonical runbook of genuine Razorpay Test Mode transactions. This is the <strong>only</strong> dashboard batch used to demonstrate measured money recovered.
          </p>
        </div>

        <div className="badge badge-disclaimer">
          🔒 Strict Invariant: Zero simulation contamination in recovered metrics
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div
          className="glass-card"
          style={{
            border: "1px solid rgba(16, 185, 129, 0.3)",
            background: "linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Verified Test Mode Recovered
            </span>
            <span className="badge badge-recovered" style={{ fontSize: "0.6875rem" }}>
              GENUINE TEST MODE
            </span>
          </div>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {formatMoney(metrics.verifiedRecoveredAmountMinor, "INR")}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            {metrics.verifiedRecoveredCount} settled, verified captured transactions
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Total Detected Volume
            </span>
            <span className="badge badge-detected" style={{ fontSize: "0.6875rem" }}>
              FAILURES
            </span>
          </div>
          <div className="metric-value" style={{ color: "#f87171" }}>
            {formatMoney(metrics.totalDetectedVolumeMinor, "INR")}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Across {metrics.totalDetectedCount} detected payment failures
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Verified Webhook Proofs
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              HMAC VERIFIED
            </span>
          </div>
          <div className="metric-value" style={{ color: "#60a5fa" }}>
            {metrics.verifiedWebhookEventsCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Cryptographically signed provider webhooks
          </div>
        </div>
      </div>

      {/* Runbook Table */}
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
              Canonical Test Mode Transaction Ledger ({ledger.length})
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              Authoritative evidence linking Case → Recovery Link → Captured Payment ID → Cryptographic Webhook.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              href="/reconciliation"
              style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", textDecoration: "underline" }}
            >
              Detailed Reconciliation
            </Link>
          </div>
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
            <p style={{ fontSize: "1rem", color: "#fff", marginBottom: "0.5rem" }}>
              No genuine test transactions recorded yet.
            </p>
            <p style={{ fontSize: "0.8125rem" }}>
              Execute the 30 transactions outlined in <code>docs/test-mode-runbook.md</code> using Razorpay Test Mode.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Case ID</th>
                  <th>Original Payment</th>
                  <th>Provider Link</th>
                  <th>Captured Payment ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Evidence Source</th>
                  <th>Settled At</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((item, idx) => (
                  <tr key={item.caseId}>
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      {idx + 1}
                    </td>
                    <td>
                      <Link
                        href={`/cases/${item.caseId}`}
                        style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "underline" }}
                      >
                        {item.caseId.slice(0, 8)}...
                      </Link>
                    </td>
                    <td>
                      <span className="code-pill">{item.originalPaymentId}</span>
                    </td>
                    <td>
                      {item.providerPaymentLinkId ? (
                        <span className="code-pill">{item.providerPaymentLinkId}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {item.providerCapturedPaymentId ? (
                        <span className="code-pill" style={{ color: "#34d399" }}>
                          {item.providerCapturedPaymentId}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: "#fff" }}>
                      {formatMoney(item.originalAmountMinor, item.currency)}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          item.caseStatus === "RECOVERED"
                            ? "badge-recovered"
                            : item.caseStatus === "MANUAL_REVIEW"
                            ? "badge-detected"
                            : "badge-system-neutral"
                        }`}
                      >
                        {item.caseStatus}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#10b981",
                          background: "rgba(16, 185, 129, 0.1)",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "0.25rem",
                        }}
                      >
                        Razorpay Test Mode
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {item.recoveredAt
                        ? new Date(item.recoveredAt).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
