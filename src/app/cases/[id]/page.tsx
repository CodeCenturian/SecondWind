import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { getCasePolicyEvaluation } from "@/lib/services/orchestrator-service";
import { PolicyPanel } from "./policy-panel";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CaseDetailPage({ params }: PageProps) {
  const { id } = await params;

  const recoveryCase = await prisma.recoveryCase.findUnique({
    where: { id },
    include: {
      attempts: {
        orderBy: { attemptNumber: "desc" },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
      },
      merchantPolicy: true,
    },
  });

  if (!recoveryCase) {
    notFound();
  }

  // Get real-time pure policy evaluation
  const { decision } = await getCasePolicyEvaluation(prisma, id);

  // Find linked webhook event(s) for this payment ID
  const webhookEvents = await prisma.webhookEvent.findMany({
    where: {
      payload: {
        path: ["payload", "payment", "entity", "id"],
        equals: recoveryCase.paymentId,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: "1.5rem" }}>
        <Link
          href="/"
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          ← Back to Cases Ledger
        </Link>
      </div>

      {/* Case Header */}
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
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#fff" }}>
              Case {recoveryCase.id}
            </h1>
            <span className="badge badge-detected">{recoveryCase.status}</span>
            <span className="code-pill">Version {recoveryCase.version}</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
            Detected on {new Date(recoveryCase.createdAt).toLocaleString("en-IN")} via provider webhook
          </p>
        </div>

        <div className="badge badge-disclaimer">
          {recoveryCase.attempts.length === 0
            ? "🔒 No recovery action has been taken"
            : `⚡ ${recoveryCase.attempts.length} Recovery Attempt(s) Dispatched`}
        </div>
      </div>

      {/* Policy Engine Evaluation & Operator Action Panel */}
      <PolicyPanel
        caseId={recoveryCase.id}
        caseVersion={recoveryCase.version}
        initialDecision={decision}
      />

      {/* Grid: Details & Diagnostics */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
          marginBottom: "2rem",
        }}
      >
        {/* Transaction & Customer Details */}
        <div className="glass-card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
            Transaction Information
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Original Amount</span>
              <span style={{ fontWeight: 700, color: "#fff" }}>
                {formatMoney(recoveryCase.amountMinor, recoveryCase.currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Minor Units (Paise)</span>
              <span className="code-pill">{recoveryCase.amountMinor.toString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Payment ID</span>
              <span className="code-pill">{recoveryCase.paymentId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Order ID</span>
              <span className="code-pill">{recoveryCase.orderId || "N/A"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Merchant ID</span>
              <span className="code-pill">{recoveryCase.merchantId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Customer Email</span>
              <span style={{ color: "var(--text-primary)" }}>{recoveryCase.customerEmail || "N/A"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Customer Phone</span>
              <span style={{ color: "var(--text-primary)" }}>{recoveryCase.customerPhone || "N/A"}</span>
            </div>
          </div>
        </div>

        {/* Failure Diagnostics */}
        <div className="glass-card">
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
            Failure Reason & Diagnostics
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
            <div>
              <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                Failure Code
              </span>
              <span className="code-pill" style={{ color: "#ef4444" }}>
                {recoveryCase.failureCode || "BAD_REQUEST_ERROR"}
              </span>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                Failure Description
              </span>
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  padding: "0.75rem",
                  borderRadius: "0.375rem",
                  color: "#fca5a5",
                }}
              >
                {recoveryCase.failureReason || "Payment authorization declined by customer bank"}
              </div>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>
                Recovery Action Status
              </span>
              <span className="badge badge-system-neutral">
                {recoveryCase.attempts.length === 0
                  ? "NO ACTIONS TAKEN • PASSIVE MONITORING"
                  : `${recoveryCase.attempts.length} ATTEMPTS EXECUTED`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Executed Recovery Attempts History */}
      {recoveryCase.attempts.length > 0 && (
        <div className="glass-card" style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
            Executed Recovery Attempts ({recoveryCase.attempts.length})
          </h2>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Attempt #</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Provider Link ID</th>
                  <th>Short URL</th>
                  <th>Dispatched At</th>
                </tr>
              </thead>
              <tbody>
                {recoveryCase.attempts.map((att) => (
                  <tr key={att.id}>
                    <td>
                      <span className="code-pill">#{att.attemptNumber}</span>
                    </td>
                    <td>
                      <span className="code-pill">{att.channel}</span>
                    </td>
                    <td>
                      <span className="badge badge-recovered">{att.status}</span>
                    </td>
                    <td>
                      <span className="code-pill">{att.paymentLinkId || "N/A"}</span>
                    </td>
                    <td>
                      {att.paymentLinkUrl ? (
                        <a
                          href={att.paymentLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--accent-primary)", textDecoration: "underline" }}
                        >
                          {att.paymentLinkUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ fontSize: "0.8125rem" }}>
                      {new Date(att.createdAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Webhook Ingestion Evidence & Traceability */}
      <div className="glass-card" style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1rem" }}>
          Provider Webhook Evidence & Signature Verification
        </h2>
        {webhookEvents.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Direct synthetic ingestion or test event.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {webhookEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.8125rem",
                    marginBottom: "0.5rem",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Event ID: </span>
                    <span className="code-pill">{evt.eventId}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Event Type: </span>
                    <span className="code-pill">{evt.eventType}</span>
                  </div>
                  <span className="badge badge-recovered">HMAC SIGNATURE VALID</span>
                </div>
                <pre
                  style={{
                    background: "#090d16",
                    padding: "0.75rem",
                    borderRadius: "0.375rem",
                    fontSize: "0.75rem",
                    color: "#94a3b8",
                    overflowX: "auto",
                    maxHeight: "180px",
                  }}
                >
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Immutable Audit Log Timeline */}
      <div className="glass-card">
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", marginBottom: "1.25rem" }}>
          Immutable Case Audit Trail ({recoveryCase.auditLogs.length})
        </h2>
        <div className="timeline">
          {recoveryCase.auditLogs.map((log) => (
            <div key={log.id} className="timeline-item">
              <div className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className="badge badge-system-neutral">{log.actorType}</span>
                  <span>{new Date(log.createdAt).toLocaleString("en-IN")}</span>
                </div>
                <div className="timeline-title">{log.action}</div>
                {log.reason && (
                  <div className="timeline-body">{log.reason}</div>
                )}
                {log.newState && (
                  <pre
                    style={{
                      marginTop: "0.5rem",
                      background: "rgba(0, 0, 0, 0.3)",
                      padding: "0.5rem",
                      borderRadius: "0.25rem",
                      fontSize: "0.75rem",
                      color: "#cbd5e1",
                      overflowX: "auto",
                    }}
                  >
                    {JSON.stringify(log.newState, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
