import { prisma } from "@/lib/db";
import { CaseStatus } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ManualReviewQueuePage() {
  const manualReviewCases = await prisma.recoveryCase.findMany({
    where: {
      status: CaseStatus.MANUAL_REVIEW,
    },
    orderBy: { updatedAt: "desc" },
    include: {
      attempts: {
        orderBy: { attemptNumber: "desc" },
        take: 1,
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
      refundTasks: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const duplicateRiskCount = manualReviewCases.filter(
    (c) =>
      c.refundTasks.length > 0 ||
      c.auditLogs.some((l) => l.action.includes("DUPLICATE_RACE") || l.action.includes("ADVERSARIAL"))
  ).length;

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
              Manual Review & Compliance Escalation Queue
            </h1>
            <span
              style={{
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "9999px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "#fbbf24",
              }}
            >
              HUMAN-IN-THE-LOOP OPERATOR QUEUE
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            Quarantine and resolution queue for cases halted by bounded policy rules, amount/currency ambiguities, or adversarial payment races.
          </p>
        </div>

        <div className="badge badge-disclaimer">
          🔒 Invariant: Automated recovery is halted until human operator review
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div
          className="glass-card"
          style={{
            border: "1px solid rgba(245, 158, 11, 0.3)",
            background: "linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Cases Requiring Review
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              PENDING RESOLUTION
            </span>
          </div>
          <div className="metric-value" style={{ color: "#fbbf24" }}>
            {manualReviewCases.length}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Halted by deterministic stopping rules
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Adversarial Race Conflicts
            </span>
            <span className="badge badge-detected" style={{ fontSize: "0.6875rem" }}>
              DUPLICATE RISK
            </span>
          </div>
          <div className="metric-value" style={{ color: "#f87171" }}>
            {duplicateRiskCount}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Late authorization or double capture quarantine
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Total Quarantined Volume
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              HELD VOLUME
            </span>
          </div>
          <div className="metric-value" style={{ color: "#60a5fa" }}>
            {formatMoney(
              manualReviewCases.reduce((acc, c) => acc + c.amountMinor, 0n),
              "INR"
            )}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Excluded from recovered money metrics
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
              Escalated Cases Ledger ({manualReviewCases.length})
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
              Review policy violation reasons, inspect audit logs, and make role-safe operator determinations.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Link
              href="/policy"
              style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", textDecoration: "underline" }}
            >
              Inspect Merchant Policy Rules
            </Link>
          </div>
        </div>

        {manualReviewCases.length === 0 ? (
          <div
            style={{
              padding: "3.5rem 1.5rem",
              textAlign: "center",
              color: "var(--text-muted)",
              background: "rgba(255, 255, 255, 0.01)",
              borderRadius: "0.5rem",
              border: "1px dashed var(--border-color)",
            }}
          >
            <p style={{ fontSize: "1.125rem", color: "#34d399", marginBottom: "0.5rem", fontWeight: 600 }}>
              ✓ No cases pending manual review.
            </p>
            <p style={{ fontSize: "0.875rem", maxWidth: "480px", margin: "0 auto" }}>
              All recovery cases are either progressing automatically within bounded merchant policy limits or have reached verified settlement.
            </p>
          </div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Payment ID</th>
                  <th>Amount</th>
                  <th>Primary Escalation Reason</th>
                  <th>Audit Evidence</th>
                  <th>Attempts</th>
                  <th>Last Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {manualReviewCases.map((c) => {
                  const latestAudit = c.auditLogs[0];
                  const hasDuplicateRisk =
                    c.refundTasks.length > 0 ||
                    c.auditLogs.some((l) => l.action.includes("DUPLICATE_RACE") || l.action.includes("ADVERSARIAL"));

                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/cases/${c.id}`}
                          style={{ color: "var(--accent-primary)", fontWeight: 600, textDecoration: "underline" }}
                        >
                          {c.id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td>
                        <span className="code-pill">{c.paymentId}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: "#fff" }}>
                        {formatMoney(c.amountMinor, c.currency)}
                      </td>
                      <td>
                        {hasDuplicateRisk ? (
                          <span
                            style={{
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "#f87171",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "0.25rem",
                            }}
                          >
                            Adversarial Payment Race
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "rgba(245, 158, 11, 0.15)",
                              color: "#fbbf24",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "0.25rem",
                            }}
                          >
                            {latestAudit?.action || "Policy Constraint Halted"}
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {latestAudit?.reason || "Halted by deterministic merchant policy"}
                      </td>
                      <td>
                        <span className="code-pill">
                          {c.attempts.length > 0 ? `Attempt #${c.attempts[0]?.attemptNumber}` : "0"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.8125rem" }}>
                        {new Date(c.updatedAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        <Link
                          href={`/cases/${c.id}`}
                          className="action-button primary"
                          style={{
                            padding: "0.3rem 0.75rem",
                            fontSize: "0.8125rem",
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
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
    </div>
  );
}
