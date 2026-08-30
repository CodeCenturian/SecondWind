import { prisma } from "@/lib/db";
import { CaseStatus, Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { CaseStateBadge } from "@/components/badges";
import { MoneyValue } from "@/components/money-value";
import { EmptyState } from "@/components/states";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface CasesPageProps {
  searchParams: Promise<{ status?: string; search?: string }>;
}

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const { status, search } = await searchParams;

  const validStatus = status && Object.values(CaseStatus).includes(status as CaseStatus)
    ? (status as CaseStatus)
    : undefined;

  const whereClause: Prisma.RecoveryCaseWhereInput = {};

  if (validStatus) {
    whereClause.status = validStatus;
  }

  if (search && search.trim()) {
    const q = search.trim();
    whereClause.OR = [
      { paymentId: { contains: q } },
      { orderId: { contains: q } },
      { customerEmail: { contains: q } },
    ];
  }

  const [cases, statusCounts] = await Promise.all([
    prisma.recoveryCase.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        attempts: {
          orderBy: { attemptNumber: "desc" },
        },
      },
      take: 100,
    }),
    prisma.recoveryCase.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
  ]);

  const countsMap = statusCounts.reduce((acc, curr) => {
    acc[curr.status] = curr._count.status;
    return acc;
  }, {} as Record<string, number>);

  const totalAllCases = Object.values(countsMap).reduce((a, b) => a + b, 0);

  const STATUS_TABS: Array<{ label: string; value?: string; count: number }> = [
    { label: "All Cases", count: totalAllCases },
    { label: "In Progress", value: CaseStatus.IN_PROGRESS, count: countsMap[CaseStatus.IN_PROGRESS] || 0 },
    { label: "Manual Review", value: CaseStatus.MANUAL_REVIEW, count: countsMap[CaseStatus.MANUAL_REVIEW] || 0 },
    { label: "Recovered", value: CaseStatus.RECOVERED, count: countsMap[CaseStatus.RECOVERED] || 0 },
    { label: "Detected", value: CaseStatus.DETECTED, count: countsMap[CaseStatus.DETECTED] || 0 },
    { label: "Closed", value: CaseStatus.CLOSED, count: countsMap[CaseStatus.CLOSED] || 0 },
  ];

  return (
    <div>
      <PageHeader
        title="Recovery Cases Ledger"
        subtitle="Authoritative operational register of all detected payment failures, active recovery link lifecycles, and settled collections."
        badge={
          <span className="badge-base badge-neutral">
            {cases.length} records shown
          </span>
        }
      />

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          borderBottom: "1px solid var(--border-default)",
          marginBottom: "var(--space-4)",
          overflowX: "auto",
          paddingBottom: "2px",
        }}
        role="tablist"
      >
        {STATUS_TABS.map((tab) => {
          const isSelected = (!validStatus && !tab.value) || validStatus === tab.value;
          const href = tab.value ? `/cases?status=${tab.value}` : "/cases";

          return (
            <Link
              key={tab.label}
              href={href}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 14px",
                fontSize: "0.8125rem",
                fontWeight: isSelected ? 600 : 400,
                color: isSelected ? "#ffffff" : "var(--text-secondary)",
                borderBottom: isSelected ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: "-1px",
                whiteSpace: "nowrap",
              }}
              role="tab"
              aria-selected={isSelected}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "1px 5px",
                  background: isSelected ? "var(--bg-surface-active)" : "var(--neutral-subtle)",
                  borderRadius: "var(--radius-xs)",
                  color: isSelected ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Cases Table Panel */}
      <div className="ops-panel" style={{ padding: "0" }}>
        {cases.length === 0 ? (
          <div style={{ padding: "var(--space-6)" }}>
            <EmptyState
              title="No cases found matching filter criteria"
              description="No recovery cases currently match the selected status filter or search parameters."
              actionText="Reset Filter to All Cases"
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
                  <th>Order ID</th>
                  <th>Customer Contact</th>
                  <th>Original Amount</th>
                  <th>Status</th>
                  <th>Attempts</th>
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
                      <td>
                        {c.orderId ? (
                          <span className="code-inline">{c.orderId}</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {c.customerEmail || c.customerPhone || "—"}
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
                            Settled
                          </span>
                        ) : attemptCount > 0 ? (
                          <span style={{ color: "var(--accent-primary)", fontSize: "0.75rem" }}>
                            #{attemptCount} Sent
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                            None
                          </span>
                        )}
                      </td>
                      <td style={{ maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.75rem" }}>
                        {c.failureReason || c.failureCode || "Authorization Failure"}
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
                          Review →
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
