import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getAccountingMetrics } from "@/lib/services/accounting-service";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [metrics, cases] = await Promise.all([
    getAccountingMetrics(prisma),
    prisma.recoveryCase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        attempts: true,
        auditLogs: true,
      },
      take: 50,
    }),
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
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fff" }}>
            Payment Recovery Dashboard
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Deterministic payment recovery ledger with strict Razorpay Test Mode verification and single-evidence accounting.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <Link
            href="/reconciliation"
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "0.375rem",
              padding: "0.5rem 1rem",
              color: "#34d399",
              fontSize: "0.8125rem",
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span>🔍 View Reconciliation Ledger →</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row with Conspicuous Data-Source Badges and Plain-Language Definitions */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        {/* Metric 1: Verified Test Mode Recovered (Financial Scope) */}
        <div
          className="glass-card"
          style={{
            border: "1px solid rgba(16, 185, 129, 0.35)",
            background: "linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.25rem" }}>
            <span className="metric-title" style={{ color: "#34d399", fontWeight: 700 }}>
              Verified Test Mode Recovered
            </span>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.2)",
                color: "#34d399",
                fontSize: "0.625rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
                letterSpacing: "0.03em",
              }}
            >
              FINANCIAL SCOPE
            </span>
          </div>

          <div className="metric-value" style={{ color: "#34d399" }}>
            {formatMoney(metrics.verifiedRecoveredAmountMinor, "INR")}
          </div>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              lineHeight: 1.4,
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              paddingTop: "0.4rem",
            }}
          >
            <strong>Plain-Language Definition:</strong> Sum of original amounts for cases where an authoritative <code>payment.captured</code> or <code>payment_link.paid</code> webhook event was HMAC-verified with <code>captured: true</code>. Operational attempts or pending checkouts do NOT count.
          </div>

          <div style={{ fontSize: "0.6875rem", color: "#34d399", marginTop: "0.35rem", fontWeight: 600 }}>
            Source: Verified Razorpay Test Mode Webhooks ({metrics.verifiedRecoveredCount} settled case{metrics.verifiedRecoveredCount === 1 ? "" : "s"})
          </div>
        </div>

        {/* Metric 2: Detected Failure Volume (Operational Scope) */}
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.25rem" }}>
            <span className="metric-title">
              Detected Failure Volume
            </span>
            <span
              style={{
                background: "rgba(255, 255, 255, 0.06)",
                color: "var(--text-muted)",
                fontSize: "0.625rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              OPERATIONAL ONLY
            </span>
          </div>

          <div className="metric-value">
            {formatMoney(metrics.totalDetectedVolumeMinor, "INR")}
          </div>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              lineHeight: 1.4,
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              paddingTop: "0.4rem",
            }}
          >
            <strong>Plain-Language Definition:</strong> Total nominal value of failed payment attempts detected across all incoming webhooks. Operational pipeline indicator only; strictly NOT recovered money.
          </div>

          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
            Source: Operational Case Ledger ({metrics.totalDetectedCount} detected case{metrics.totalDetectedCount === 1 ? "" : "s"})
          </div>
        </div>

        {/* Metric 3: Dispatched Operational Attempts */}
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.25rem" }}>
            <span className="metric-title">
              Operational Attempts Dispatched
            </span>
            <span
              style={{
                background: "rgba(59, 130, 246, 0.15)",
                color: "#60a5fa",
                fontSize: "0.625rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              ACTIVITY METRIC
            </span>
          </div>

          <div className="metric-value" style={{ color: "#60a5fa" }}>
            {metrics.operationalAttemptsCount}
          </div>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              lineHeight: 1.4,
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              paddingTop: "0.4rem",
            }}
          >
            <strong>Plain-Language Definition:</strong> Count of outbound recovery payment links generated and dispatched to customers. Operational activity only; does NOT imply payment or recovery.
          </div>

          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
            Pipeline: {metrics.inProgressCasesCount} awaiting payment, {metrics.manualReviewCasesCount} in manual review
          </div>
        </div>

        {/* Metric 4: Verified Webhook Events */}
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.25rem" }}>
            <span className="metric-title">
              Verified Webhook Events
            </span>
            <span
              style={{
                background: "rgba(147, 51, 234, 0.15)",
                color: "#c084fc",
                fontSize: "0.625rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: "9999px",
              }}
            >
              CRYPTO-VERIFIED
            </span>
          </div>

          <div className="metric-value" style={{ color: "#c084fc" }}>
            {metrics.verifiedWebhookEventsCount}
          </div>

          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginTop: "0.5rem",
              lineHeight: 1.4,
              borderTop: "1px solid rgba(255, 255, 255, 0.05)",
              paddingTop: "0.4rem",
            }}
          >
            <strong>Plain-Language Definition:</strong> Total webhook payloads received from Razorpay with valid HMAC-SHA256 signatures, claimed idempotently without duplicate side-effects.
          </div>

          <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.35rem" }}>
            Source: Inbound Webhook Ingestion Log (HMAC Validated)
          </div>
        </div>
      </div>

      {/* Cases Table */}
      <div className="glass-card" style={{ padding: "1.5rem" }}>
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
              Case Ledger ({cases.length})
            </h2>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
              Optimistic Version Protection Active • Real-Time Deterministic Policy
            </span>
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
              Reconciliation View
            </Link>
          </div>
        </div>

        {cases.length === 0 ? (
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
              No recovery cases detected yet.
            </p>
            <p style={{ fontSize: "0.8125rem" }}>
              Deliver a verified <code className="code-pill">payment.failed</code> webhook to{" "}
              <code className="code-pill">/api/webhooks/razorpay</code> to trigger automatic detection.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Payment ID</th>
                  <th>Order ID</th>
                  <th>Original Amount</th>
                  <th>Status</th>
                  <th>Recovery Progress</th>
                  <th>Failure Reason</th>
                  <th>Detected At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const isRecovered = c.status === "RECOVERED";
                  const isManualReview = c.status === "MANUAL_REVIEW";
                  const isInProgress = c.status === "IN_PROGRESS";

                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="code-pill">{c.id.slice(0, 8)}...</span>
                      </td>
                      <td>
                        <span className="code-pill">{c.paymentId}</span>
                      </td>
                      <td>
                        {c.orderId ? (
                          <span className="code-pill">{c.orderId}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: "#fff" }}>
                        {formatMoney(c.amountMinor, c.currency)}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            isRecovered
                              ? "badge-recovered"
                              : isManualReview
                              ? "badge-detected"
                              : isInProgress
                              ? "badge-system-neutral"
                              : "badge-detected"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td>
                        {isRecovered ? (
                          <span style={{ color: "#34d399", fontWeight: 600, fontSize: "0.8125rem" }}>
                            ✓ Recovered & Settled
                          </span>
                        ) : c.attempts.length > 0 ? (
                          <span style={{ color: "#60a5fa", fontSize: "0.8125rem" }}>
                            ⚡ Attempt #{c.attempts.length} Dispatched
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                            🔒 No action taken
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.failureReason || c.failureCode || "Payment Failed"}
                      </td>
                      <td style={{ fontSize: "0.8125rem" }}>
                        {new Date(c.createdAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        <Link
                          href={`/cases/${c.id}`}
                          style={{
                            color: "var(--accent-primary)",
                            fontWeight: 600,
                            fontSize: "0.8125rem",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          View Detail →
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
