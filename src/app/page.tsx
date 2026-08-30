import { prisma } from "@/lib/db";
import { getAccountingMetrics } from "@/lib/services/accounting-service";
import { PageHeader } from "@/components/page-header";
import { PolicyStatusBar } from "@/components/policy-status-bar";
import { EvidenceSourceBadge, CaseStateBadge } from "@/components/badges";
import { MoneyValue } from "@/components/money-value";
import { EmptyState } from "@/components/states";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [metrics, cases, recentAuditLogs] = await Promise.all([
    getAccountingMetrics(prisma),
    prisma.recoveryCase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      take: 25,
    }),
    prisma.caseAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        recoveryCase: {
          select: { id: true, status: true, amountMinor: true, currency: true },
        },
      },
    }),
  ]);

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Payment Recovery Dashboard"
        subtitle="Deterministic payment recovery operations console with strict Razorpay Test Mode single-evidence accounting."
        badge={
          <span className="badge-base badge-recovered">
            ● Razorpay Test Mode Live
          </span>
        }
        actions={
          <Link href="/reconciliation" className="btn btn-secondary btn-sm">
            <span>🔍 Provenance Ledger →</span>
          </Link>
        }
      />

      {/* 2. Merchant Policy / Recovery Policy Status Bar (Directly below header) */}
      <PolicyStatusBar
        maxAttempts={3}
        coolingPeriodMinutes={30}
        ruleCount={8}
      />

      {/* 3. Financial Anchor & Operational Metrics */}
      <div className="metrics-row rhythm-24">
        {/* Metric 1: Verified Test Mode Recovered (Financial Scope Anchor) */}
        <div
          className="ops-panel"
          style={{
            borderLeft: "3px solid var(--success-primary)",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption" style={{ color: "var(--success-text)", fontWeight: 700 }}>
              Verified Recovered Amount
            </span>
            <EvidenceSourceBadge scope="FINANCIAL_SCOPE" />
          </div>

          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--success-text)", margin: "4px 0" }}>
            <MoneyValue amountMinor={metrics.verifiedRecoveredAmountMinor} currency="INR" />
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "var(--space-2)", lineHeight: 1.4 }}>
            Settled via HMAC-verified captured recovery webhooks ({metrics.verifiedRecoveredCount} settled case{metrics.verifiedRecoveredCount === 1 ? "" : "s"}).
          </p>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "var(--space-2)",
              paddingTop: "var(--space-2)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            Money counted strictly after verified <code>payment.captured</code>. Zero speculative attribution.
          </div>
        </div>

        {/* Metric 2: Detected Failure Volume (Operational Scope) */}
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Detected Failure Volume</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" />
          </div>

          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            <MoneyValue amountMinor={metrics.totalDetectedVolumeMinor} currency="INR" />
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "var(--space-2)", lineHeight: 1.4 }}>
            Total value across {metrics.totalDetectedCount} detected failed payment events.
          </p>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "var(--space-2)",
              paddingTop: "var(--space-2)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            Operational pipeline volume only; strictly NOT recognized as recovered money.
          </div>
        </div>

        {/* Metric 3: Operational Attempts Dispatched */}
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Attempts Dispatched</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="ACTIVITY" />
          </div>

          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-primary)", margin: "4px 0" }}>
            {metrics.operationalAttemptsCount}
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "var(--space-2)", lineHeight: 1.4 }}>
            {metrics.inProgressCasesCount} awaiting checkout • {metrics.manualReviewCasesCount} in manual review
          </p>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "var(--space-2)",
              paddingTop: "var(--space-2)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            Outbound customer payment links generated and dispatched.
          </div>
        </div>

        {/* Metric 4: Verified Webhook Events */}
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Crypto-Verified Webhooks</span>
            <EvidenceSourceBadge scope="FINANCIAL_SCOPE" label="HMAC VERIFIED" />
          </div>

          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            {metrics.verifiedWebhookEventsCount}
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "var(--space-2)", lineHeight: 1.4 }}>
            Inbound HMAC-SHA256 authenticated payloads claimed idempotently.
          </p>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "var(--space-2)",
              paddingTop: "var(--space-2)",
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            Zero replay duplicates or side-effect re-executions allowed.
          </div>
        </div>
      </div>

      {/* 4. Operational State Distribution Bar */}
      <div
        className="ops-panel rhythm-24"
        style={{
          padding: "var(--space-3) var(--space-4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          background: "var(--bg-surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <span className="text-caption" style={{ fontWeight: 700 }}>
            Case Distribution:
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--success-text)" }}>
            ● Recovered: <strong>{metrics.verifiedRecoveredCount}</strong>
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--accent-primary)" }}>
            In Progress: <strong>{metrics.inProgressCasesCount}</strong>
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--warning-text)" }}>
            Manual Review: <strong>{metrics.manualReviewCasesCount}</strong>
          </span>
          <span style={{ fontSize: "0.75rem", color: "var(--danger-text)" }}>
            Duplicate Risk: <strong>{metrics.duplicateRiskCasesCount}</strong>
          </span>
        </div>

        <Link href="/cases" style={{ fontSize: "0.75rem", color: "var(--accent-primary)", fontWeight: 600 }}>
          View Full Ledger ({cases.length}) →
        </Link>
      </div>

      {/* 5. Cases Ledger Table */}
      <div className="ops-panel rhythm-32" style={{ padding: "0" }}>
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
            <h2 className="text-h2">Recent Recovery Cases</h2>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Optimistic concurrency lock active • Real-time policy evaluation
            </span>
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Link href="/cases" className="btn btn-secondary btn-sm">
              All Cases Ledger
            </Link>
          </div>
        </div>

        {cases.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="No recovery cases detected yet"
              description="Deliver a verified payment.failed webhook event to /api/webhooks/razorpay or use the Developer Sandbox to simulate an ingestion scenario."
              actionText="Open Developer Event Injector"
              actionHref="/dev/injector"
            />
          </div>
        ) : (
          <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Payment ID</th>
                  <th>Original Amount</th>
                  <th>Status</th>
                  <th>Recovery Progress</th>
                  <th>Failure Reason</th>
                  <th>Detected At</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const isRecovered = c.status === "RECOVERED";
                  const attemptCount = c.attempts.length;

                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="code-inline">{c.id.slice(0, 8)}</span>
                      </td>
                      <td>
                        <span className="code-inline">{c.paymentId}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        <MoneyValue amountMinor={c.amountMinor} currency={c.currency} />
                      </td>
                      <td>
                        <CaseStateBadge status={c.status} />
                      </td>
                      <td>
                        {isRecovered ? (
                          <span style={{ color: "var(--success-text)", fontWeight: 600, fontSize: "0.75rem" }}>
                            Recovered & Settled
                          </span>
                        ) : attemptCount > 0 ? (
                          <span style={{ color: "var(--accent-primary)", fontSize: "0.75rem" }}>
                            Attempt #{attemptCount} Dispatched
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            Passive Monitoring
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.failureReason || c.failureCode || "Payment Authorization Failed"}
                      </td>
                      <td className="text-mono" style={{ fontSize: "0.75rem" }}>
                        {new Date(c.createdAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/cases/${c.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          Review Case →
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

      {/* 6. Recent Audit Activity */}
      {recentAuditLogs.length > 0 && (
        <div className="ops-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-4)",
            }}
          >
            <div>
              <h2 className="text-h2">Recent Audit Trail Activity</h2>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                Cryptographically verifiable, immutable case ledger events
              </span>
            </div>
            <Link href="/reconciliation" style={{ fontSize: "0.75rem", color: "var(--accent-primary)" }}>
              View Audit Ledger →
            </Link>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {recentAuditLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  gap: "var(--space-3)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  <span className="badge-base badge-neutral" style={{ fontSize: "0.625rem" }}>
                    {log.actorType}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                    {log.action}
                  </span>
                  {log.reason && (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>
                      — {log.reason}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                  <Link
                    href={`/cases/${log.caseId}`}
                    className="code-inline"
                    style={{ fontSize: "0.6875rem" }}
                  >
                    Case: {log.caseId.slice(0, 8)}
                  </Link>
                  <span className="text-mono" style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {new Date(log.createdAt).toLocaleTimeString("en-IN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
