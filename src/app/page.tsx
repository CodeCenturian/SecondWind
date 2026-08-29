import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [cases, totalWebhookEvents] = await Promise.all([
    prisma.recoveryCase.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        attempts: true,
        auditLogs: true,
      },
      take: 50,
    }),
    prisma.webhookEvent.count(),
  ]);

  const totalDetected = cases.length;
  const totalAmountMinor = cases.reduce(
    (acc, curr) => acc + curr.amountMinor,
    0n
  );

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
            Payment Recovery Cases
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Deterministic detection of failed transactions from verified provider webhooks.
          </p>
        </div>
        <div className="badge badge-disclaimer">
          🔒 No recovery action has been taken (Detection Phase Only)
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="glass-card">
          <div className="metric-title">Total Detected Cases</div>
          <div className="metric-value">{totalDetected}</div>
          <div className="metric-sub">Awaiting strategy assignment</div>
        </div>

        <div className="glass-card">
          <div className="metric-title">Total Detected Volume</div>
          <div className="metric-value">{formatMoney(totalAmountMinor, "INR")}</div>
          <div className="metric-sub">Original transaction values</div>
        </div>

        <div className="glass-card">
          <div className="metric-title">Recovered Amount</div>
          <div className="metric-value" style={{ color: "#94a3b8" }}>
            ₹0.00
          </div>
          <div className="metric-sub">Zero automated recovery actions triggered</div>
        </div>

        <div className="glass-card">
          <div className="metric-title">Verified Webhook Events</div>
          <div className="metric-value">{totalWebhookEvents}</div>
          <div className="metric-sub">HMAC SHA-256 signature verified</div>
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
          }}
        >
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff" }}>
            Case Ledger ({cases.length})
          </h2>
          <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
            Optimistic Version Protection Active
          </span>
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
                  <th>Failure Reason</th>
                  <th>Version</th>
                  <th>Detected At</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
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
                      <span className="badge badge-detected">{c.status}</span>
                    </td>
                    <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.failureReason || c.failureCode || "Payment Failed"}
                    </td>
                    <td>
                      <span className="code-pill">v{c.version}</span>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
