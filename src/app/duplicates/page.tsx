import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getAccountingMetrics, getDuplicateResolutionQueue } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DuplicateResolutionQueuePage() {
  const [metrics, queue] = await Promise.all([
    getAccountingMetrics(prisma),
    getDuplicateResolutionQueue(prisma),
  ]);

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
              Duplicate Payment Race Queue
            </h1>
            <span
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "9999px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#f87171",
              }}
            >
              ADVERSARIAL RACE REMEDIATION
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            Operator resolution queue for cases where an original payment authorized/captured after recovery was already settled, preventing double-collection.
          </p>
        </div>

        <div className="badge badge-disclaimer">
          🔒 Invariant: Double payments are quarantined; zero speculative revenue recognition
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div
          className="glass-card"
          style={{
            border: "1px solid rgba(239, 68, 68, 0.3)",
            background: "linear-gradient(180deg, rgba(239, 68, 68, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Flagged Race Conflicts
            </span>
            <span className="badge badge-detected" style={{ fontSize: "0.6875rem" }}>
              DUPLICATE RISK
            </span>
          </div>
          <div className="metric-value" style={{ color: "#f87171" }}>
            {metrics.duplicateRiskCasesCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Recovery actions permanently locked on these cases
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Pending Refund Tasks
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              OPERATOR REVIEW
            </span>
          </div>
          <div className="metric-value" style={{ color: "#fbbf24" }}>
            {metrics.pendingRefundTasksCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Awaiting manual operator authorization or retry
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Processed Remediation Refunds
            </span>
            <span className="badge badge-recovered" style={{ fontSize: "0.6875rem" }}>
              SETTLED REFUNDS
            </span>
          </div>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {formatMoney(metrics.processedRefundsAmountMinor, "INR")}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            {metrics.processedRefundsCount} refund(s) confirmed by provider
          </div>
        </div>
      </div>

      {/* Queue Table */}
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
              Duplicate Resolution Ledger ({queue.length})
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              Audit list of detected adversarial payment races, correlation classifications, and associated refund tasks.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              href="/reconciliation"
              style={{
                color: "var(--text-secondary)",
                fontSize: "0.8125rem",
                textDecoration: "underline",
              }}
            >
              Reconciliation Ledger
            </Link>
          </div>
        </div>

        {queue.length === 0 ? (
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
            <p style={{ fontSize: "1rem", color: "#34d399", marginBottom: "0.5rem", fontWeight: 600 }}>
              ✓ No active duplicate payment races detected.
            </p>
            <p style={{ fontSize: "0.8125rem" }}>
              All settled recovery payments remain reconciled with zero double-collection conflicts.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Original Payment</th>
                  <th>Conflicting Payment</th>
                  <th>Amount</th>
                  <th>Refund Status</th>
                  <th>Provider Refund ID</th>
                  <th>Failure / Policy Reason</th>
                  <th>Created At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.refundTaskId || item.caseId}>
                    <td>
                      <Link
                        href={`/cases/${item.caseId}`}
                        style={{
                          color: "var(--accent-primary)",
                          fontWeight: 600,
                          textDecoration: "underline",
                        }}
                      >
                        {item.caseId.slice(0, 8)}...
                      </Link>
                    </td>
                    <td>
                      <span className="code-pill">{item.originalPaymentId}</span>
                    </td>
                    <td>
                      <span className="code-pill" style={{ color: "#f87171" }}>
                        {item.refundPaymentId}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: "#fff" }}>
                      {formatMoney(item.amountMinor, item.currency)}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          item.refundStatus === "PROCESSED"
                            ? "badge-recovered"
                            : item.refundStatus === "FAILED"
                            ? "badge-detected"
                            : "badge-system-neutral"
                        }`}
                      >
                        {item.refundStatus || "MANUAL_REVIEW"}
                      </span>
                    </td>
                    <td>
                      {item.refundId ? (
                        <span className="code-pill" style={{ color: "#34d399" }}>
                          {item.refundId}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.failureReason || "Adversarial duplicate race flagged by correlation engine"}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {new Date(item.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      <Link
                        href={`/cases/${item.caseId}`}
                        style={{
                          color: "var(--accent-primary)",
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        Inspect Case →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adversarial Race Policy Information Box */}
      <div
        className="glass-card"
        style={{
          border: "1px solid rgba(255, 255, 255, 0.08)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#fff", marginBottom: "0.5rem" }}>
          Adversarial Payment Race Protection & Remediation Protocol
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
            <strong>Deterministic Pure Correlation:</strong> Evaluates payment IDs, opaque correlation tokens (<code>rcov_corr_...</code>), attempt references, order IDs, and timestamps. Never matches solely on amount.
          </li>
          <li>
            <strong>Immediate Recovery Action Lockout:</strong> When a late original payment event reaches an already recovered case, <code>DUPLICATE_RISK</code> is flagged immediately, stopping any further recovery links from being generated.
          </li>
          <li>
            <strong>Merchant Policy Control:</strong> Automatic refunds occur only if explicitly enabled via <code>MerchantPolicy.autoRefundEnabled: true</code> and within configured thresholds. Otherwise, a <code>RefundTask</code> is safely queued in <code>MANUAL_REVIEW</code>.
          </li>
          <li>
            <strong>Out-of-Transaction Safe Execution:</strong> Provider cancellation (<code>POST /v1/payment_links/{'{id}'}/cancel</code>) and refund (<code>POST /v1/payments/{'{id}'}/refund</code>) calls execute outside the database transaction. Provider failures are recorded accurately without false <code>REFUNDED</code> states.
          </li>
        </ul>
      </div>
    </div>
  );
}
