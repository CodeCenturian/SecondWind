import { prisma } from "@/lib/db";
import { CaseStatus } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { MoneyValue } from "@/components/money-value";
import { CaseStateBadge, EvidenceSourceBadge } from "@/components/badges";
import { EmptyState } from "@/components/states";
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

  const totalQuarantinedVolume = manualReviewCases.reduce((acc, c) => acc + c.amountMinor, 0n);

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Manual Review & Governance Queue"
        subtitle="Human-in-the-loop quarantine queue for recovery cases halted by deterministic policy bounds, high values (>₹10k), currency ambiguity, or adversarial payment races."
        badge={
          <span className="badge-base badge-warning">
            {manualReviewCases.length} Cases Quarantined
          </span>
        }
      />

      {/* Safety Notice Banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--warning-primary)",
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
          <strong>Safety Boundary Active:</strong> Automated recovery links are intentionally halted to prevent unvalidated customer dispatches or double-recovery races.
        </span>
        <span className="code-inline">Zero Unvalidated Dispatches</span>
      </div>

      {/* 2. Metrics Row */}
      <div className="metrics-row rhythm-24">
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Pending Review</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="QUARANTINE" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--warning-text)", margin: "4px 0" }}>
            {manualReviewCases.length}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Cases requiring operator investigation and decision
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Adversarial Race Conflicts</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="RACE RISK" />
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--danger-text)", margin: "4px 0" }}>
            {duplicateRiskCount}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Late authorization or double capture conflicts
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Total Quarantined Volume</span>
            <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="HELD VOLUME" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            <MoneyValue amountMinor={totalQuarantinedVolume} currency="INR" />
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Excluded from verified recovered revenue totals
          </p>
        </div>
      </div>

      {/* 3. Queue Table */}
      <div className="ops-panel" style={{ padding: "0" }}>
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-h2">Quarantined Cases Ledger ({manualReviewCases.length})</h2>
        </div>

        {manualReviewCases.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="Manual review queue is empty"
              description="Zero cases are currently quarantined for manual review. All active recovery flows are either proceeding deterministically or already settled."
              actionText="View Cases Ledger"
              actionHref="/cases"
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
                  <th>Quarantine Reason</th>
                  <th>Latest Audit Action</th>
                  <th>Updated At</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {manualReviewCases.map((c) => {
                  const latestAudit = c.auditLogs[0];
                  const hasRace = c.refundTasks.length > 0 || latestAudit?.action.includes("DUPLICATE");

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
                        <span style={{ color: hasRace ? "var(--danger-text)" : "var(--warning-text)", fontSize: "0.75rem", fontWeight: 600 }}>
                          {hasRace ? "Adversarial Payment Race" : c.failureReason || "Policy Boundary Reached"}
                        </span>
                      </td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {latestAudit ? (
                          <span>
                            <span className="code-inline" style={{ fontSize: "0.6875rem" }}>{latestAudit.action}</span>
                            {latestAudit.reason && ` - ${latestAudit.reason.slice(0, 40)}...`}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-mono" style={{ fontSize: "0.75rem" }}>
                        {new Date(c.updatedAt).toLocaleString("en-IN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/cases/${c.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          Resolve Case →
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
