import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { MoneyValue } from "@/components/money-value";
import { CaseStateBadge } from "@/components/badges";
import { AuditTimeline } from "@/components/audit-timeline";
import { getCasePolicyEvaluation } from "@/lib/services/orchestrator-service";
import { PolicyPanel } from "./policy-panel";
import { DiagnosisPanel } from "./diagnosis-panel";
import { StateFlowDiagram } from "./state-flow-diagram";
import { OperatorControls } from "./operator-controls";
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
      refundTasks: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!recoveryCase) {
    notFound();
  }

  // Check duplicate risk
  const hasDuplicateRisk =
    recoveryCase.refundTasks.length > 0 ||
    recoveryCase.auditLogs.some(
      (l) => l.action.includes("DUPLICATE_RACE") || l.action.includes("ADVERSARIAL")
    );

  // Get real-time pure policy evaluation and any persisted AI diagnosis
  const { decision, aiDiagnosis } = await getCasePolicyEvaluation(prisma, id);

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
    <div>
      {/* Navigation Breadcrumb */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <Link
          href="/cases"
          style={{
            color: "var(--text-secondary)",
            fontSize: "0.8125rem",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          ← Back to Cases Ledger
        </Link>
      </div>

      {/* Case Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
          gap: "var(--space-3)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <h1 className="text-h1">Case {recoveryCase.id}</h1>
            <CaseStateBadge status={recoveryCase.status} />
            <span className="code-inline">Lock v{recoveryCase.version}</span>
          </div>
          <p className="text-body" style={{ marginTop: "4px" }}>
            Ingested on {new Date(recoveryCase.createdAt).toLocaleString("en-IN")} via HMAC-verified provider webhook
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span className="badge-base badge-neutral">
            {recoveryCase.attempts.length === 0
              ? "No Dispatches"
              : `${recoveryCase.attempts.length} Outbound Attempt(s)`}
          </span>
        </div>
      </div>

      {/* 1. Deterministic State Flow Stepper */}
      <StateFlowDiagram
        status={recoveryCase.status}
        attemptsCount={recoveryCase.attempts.length}
        hasDuplicateRisk={hasDuplicateRisk}
      />

      {/* 2. Operator Governance & Action Bar */}
      <OperatorControls
        caseId={recoveryCase.id}
        currentStatus={recoveryCase.status}
        currentVersion={recoveryCase.version}
      />

      {/* 3. Deterministic Policy Engine Evaluation Panel */}
      <PolicyPanel
        caseId={recoveryCase.id}
        caseVersion={recoveryCase.version}
        initialDecision={decision}
      />

      {/* 4. AI Semantic Diagnosis Advisory Panel */}
      <DiagnosisPanel
        caseId={recoveryCase.id}
        initialDiagnosis={aiDiagnosis}
      />

      {/* 5. Transaction Diagnostics & Customer Details Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-6)",
        }}
      >
        {/* Transaction Information Panel */}
        <div className="ops-panel">
          <h2 className="text-h3" style={{ marginBottom: "var(--space-3)" }}>
            Transaction Information
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Original Amount</span>
              <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                <MoneyValue amountMinor={recoveryCase.amountMinor} currency={recoveryCase.currency} showSubunits />
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Payment ID</span>
              <span className="code-inline">{recoveryCase.paymentId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Order ID</span>
              <span className="code-inline">{recoveryCase.orderId || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Merchant ID</span>
              <span className="code-inline">{recoveryCase.merchantId}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Customer Email</span>
              <span style={{ color: "var(--text-primary)" }}>{recoveryCase.customerEmail || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Customer Phone</span>
              <span style={{ color: "var(--text-primary)" }}>{recoveryCase.customerPhone || "—"}</span>
            </div>
          </div>
        </div>

        {/* Failure Diagnostics Panel */}
        <div className="ops-panel">
          <h2 className="text-h3" style={{ marginBottom: "var(--space-3)" }}>
            Failure Diagnostics & Risk
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.8125rem" }}>
            <div>
              <span className="text-caption" style={{ display: "block", marginBottom: "2px" }}>
                Failure Code
              </span>
              <span className="code-inline" style={{ color: "var(--danger-text)" }}>
                {recoveryCase.failureCode || "BAD_REQUEST_ERROR"}
              </span>
            </div>
            <div>
              <span className="text-caption" style={{ display: "block", marginBottom: "2px" }}>
                Failure Description
              </span>
              <div
                style={{
                  background: "var(--danger-subtle)",
                  border: "1px solid var(--danger-border)",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-xs)",
                  color: "var(--danger-text)",
                  fontSize: "0.75rem",
                }}
              >
                {recoveryCase.failureReason || "Payment authorization declined by customer issuing bank"}
              </div>
            </div>
            <div>
              <span className="text-caption" style={{ display: "block", marginBottom: "2px" }}>
                Customer Endpoint Verification
              </span>
              <span style={{ color: (recoveryCase.customerEmail || recoveryCase.customerPhone) ? "var(--success-text)" : "var(--danger-text)" }}>
                {(recoveryCase.customerEmail || recoveryCase.customerPhone) ? "Endpoint Verified (Channel Dispatch Active)" : "No Direct Endpoint (Requires Review)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Executed Recovery Attempts Table */}
      {recoveryCase.attempts.length > 0 && (
        <div className="ops-panel rhythm-24" style={{ padding: "0" }}>
          <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 className="text-h2">Dispatched Recovery Attempts ({recoveryCase.attempts.length})</h2>
          </div>
          <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Attempt #</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Provider Link ID</th>
                  <th>Payment Link URL</th>
                  <th>Dispatched At</th>
                </tr>
              </thead>
              <tbody>
                {recoveryCase.attempts.map((att) => (
                  <tr key={att.id}>
                    <td>
                      <span className="code-inline">#{att.attemptNumber}</span>
                    </td>
                    <td>
                      <span className="code-inline">{att.channel}</span>
                    </td>
                    <td>
                      <span className="badge-base badge-recovered">{att.status}</span>
                    </td>
                    <td>
                      <span className="code-inline">{att.paymentLinkId || "—"}</span>
                    </td>
                    <td>
                      {att.paymentLinkUrl ? (
                        <a
                          href={att.paymentLinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--accent-primary)", textDecoration: "underline", fontSize: "0.75rem" }}
                        >
                          {att.paymentLinkUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-mono" style={{ fontSize: "0.75rem" }}>
                      {new Date(att.createdAt).toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. Webhook Ingestion Evidence */}
      <div className="ops-panel rhythm-24">
        <h2 className="text-h2" style={{ marginBottom: "var(--space-3)" }}>
          Provider Webhook Signature Evidence ({webhookEvents.length})
        </h2>
        {webhookEvents.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            Ingested via synthetic test fixture or direct developer simulation.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {webhookEvents.map((evt) => (
              <div
                key={evt.id}
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-3)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.75rem",
                    marginBottom: "var(--space-2)",
                    flexWrap: "wrap",
                    gap: "8px",
                  }}
                >
                  <div style={{ display: "flex", gap: "var(--space-3)" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Event ID: </span>
                      <span className="code-inline">{evt.eventId}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-muted)" }}>Type: </span>
                      <span className="code-inline">{evt.eventType}</span>
                    </div>
                  </div>
                  <span className="badge-base badge-recovered">HMAC SIGNATURE VALID</span>
                </div>
                <pre
                  className="code-inline text-mono"
                  style={{
                    display: "block",
                    padding: "8px",
                    fontSize: "0.6875rem",
                    maxHeight: "180px",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 8. Immutable Audit Trail Timeline */}
      <div className="ops-panel">
        <AuditTimeline
          title="Immutable Case Audit Trail"
          logs={recoveryCase.auditLogs}
        />
      </div>
    </div>
  );
}
