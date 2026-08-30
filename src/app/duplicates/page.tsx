import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { MoneyValue } from "@/components/money-value";
import { EvidenceSourceBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
import { getAccountingMetrics, getDuplicateResolutionQueue } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DuplicateResolutionQueuePage() {
  const [metrics, queue] = await Promise.all([
    getAccountingMetrics(prisma),
    getDuplicateResolutionQueue(prisma),
  ]);

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Duplicate Payment Race Queue"
        subtitle="Remediation ledger for adversarial payment races where an original payment authorized or captured after a recovery link was already settled."
        badge={
          <span className="badge-base badge-danger">
            {metrics.duplicateRiskCasesCount} Race Conflicts Flagged
          </span>
        }
      />

      {/* Safety Invariant Notice */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--danger-primary)",
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
          <strong>Zero Double-Counting Invariant:</strong> Late original transactions are immediately quarantined. Zero duplicate revenue is recognized.
        </span>
        <span className="code-inline">Automatic RefundTask Generated</span>
      </div>

      {/* 2. Metrics Row */}
      <div className="metrics-row rhythm-24">
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Flagged Race Conflicts</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="QUARANTINED" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--danger-text)", margin: "4px 0" }}>
            {metrics.duplicateRiskCasesCount}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Recovery actions permanently locked on these cases
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Pending Refund Tasks</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="OPERATOR REVIEW" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--warning-text)", margin: "4px 0" }}>
            {metrics.pendingRefundTasksCount}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Awaiting operator refund authorization or provider webhook confirmation
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Processed Refunds Total</span>
            <EvidenceSourceBadge scope="SETTLED_REFUNDS" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--success-text)", margin: "4px 0" }}>
            <MoneyValue amountMinor={metrics.processedRefundsAmountMinor} currency="INR" />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {metrics.processedRefundsCount} remediation refund(s) confirmed by provider
          </p>
        </div>
      </div>

      {/* 3. Queue Table */}
      <div className="ops-panel" style={{ padding: "0" }}>
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-h2">Adversarial Race Resolution Ledger ({queue.length})</h2>
        </div>

        {queue.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="No duplicate race conflicts detected"
              description="Zero adversarial payment race conditions exist in the ledger. All settled recovery links and original transactions have clean, single-settlement integrity."
              actionText="View Provenance Ledger"
              actionHref="/reconciliation"
            />
          </div>
        ) : (
          <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Payment ID</th>
                  <th>Order ID</th>
                  <th>Original Amount</th>
                  <th>Refund Status</th>
                  <th>Refund ID</th>
                  <th>Detected At</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.caseId}>
                    <td>
                      <span className="code-inline">{item.caseId.slice(0, 8)}</span>
                    </td>
                    <td>
                      <span className="code-inline">{item.originalPaymentId}</span>
                    </td>
                    <td>
                      {item.orderId ? (
                        <span className="code-inline">{item.orderId}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                      <MoneyValue amountMinor={item.amountMinor} currency={item.currency} />
                    </td>
                    <td>
                      <span
                        className={`badge-base ${
                          item.refundStatus === "PROCESSED"
                            ? "badge-recovered"
                            : item.refundStatus === "PENDING"
                            ? "badge-warning"
                            : "badge-danger"
                        }`}
                      >
                        {item.refundStatus || "DUPLICATE RISK LOCKED"}
                      </span>
                    </td>
                    <td>
                      <span className="code-inline">
                        {item.refundId || item.refundTaskId || "PENDING_OPERATOR"}
                      </span>
                    </td>
                    <td className="text-mono" style={{ fontSize: "0.75rem" }}>
                      {new Date(item.detectedAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        href={`/cases/${item.caseId}`}
                        className="btn btn-secondary btn-sm"
                      >
                        Investigate →
                      </Link>
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
