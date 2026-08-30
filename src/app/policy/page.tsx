import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { EvidenceSourceBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function MerchantPolicyPage() {
  const policies = await prisma.merchantPolicy.findMany({
    orderBy: { createdAt: "desc" },
  });

  const defaultPolicy = policies[0] || {
    merchantId: "merch_default",
    maxAttempts: 3,
    coolingPeriodMinutes: 30,
    linkExpiryMinutes: 1440,
    autoRefundEnabled: false,
    autoRefundThresholdMinor: 0n,
    preferredChannels: ["PAYMENT_LINK", "EMAIL"],
  };

  const STOPPING_RULES = [
    {
      rule: "1. Terminal Case State",
      condition: "Case is already RECOVERED, CLOSED, or FAILED",
      action: "STOP",
      description: "Permanently halts link dispatch to prevent double recovery or spamming terminal cases.",
    },
    {
      rule: "2. Adversarial Duplicate Payment Race",
      condition: "Late original payment event arrives after recovery link is already settled",
      action: "MANUAL_REVIEW",
      description: "Flags DUPLICATE_RISK, locks automated recovery actions, and queues RefundTask for operator review.",
    },
    {
      rule: "3. Customer Opt-Out / Do Not Contact",
      condition: "Customer marked isDoNotContact = true",
      action: "STOP",
      description: "Enforces strict privacy and consent compliance; immediately halts all outbound messages.",
    },
    {
      rule: "4. Maximum Attempts Limit Exceeded",
      condition: "Case has reached policy cap (3 attempts)",
      action: "STOP",
      description: "Caps retry fatigue and prevents endless automated notifications.",
    },
    {
      rule: "5. Active Cooling Period",
      condition: "Less than 30 minutes elapsed since previous attempt dispatch",
      action: "STOP",
      description: "Enforces non-harassment backoff cadence between outbound recovery messages.",
    },
    {
      rule: "6. Missing Customer Contact Info",
      condition: "Neither customerEmail nor customerPhone is present",
      action: "STOP",
      description: "Rejects delivery if no valid communication endpoint exists.",
    },
    {
      rule: "7. Amount Below Policy Floor (< ₹1.00)",
      condition: "Amount is less than 100 minor units (₹1.00)",
      action: "STOP",
      description: "Prevents uneconomical micro-transaction recovery link generation.",
    },
    {
      rule: "8. High Value / Currency Ambiguity",
      condition: "Amount exceeds ₹10,000.00 ceiling or currency is non-INR",
      action: "MANUAL_REVIEW",
      description: "Routes high-risk or cross-border payments for operator sign-off before link dispatch.",
    },
  ];

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Merchant Policy Engine & Stopping Rules"
        subtitle="Deterministic rule specifications governing automated recovery link generation, cooling periods, attempt limits, and safety stopping boundaries."
        badge={
          <span className="badge-base badge-accent">
            DETERMINISTIC CONSTRAINTS
          </span>
        }
      />

      {/* Safety Invariant Banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--accent-primary)",
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
          <strong>Deterministic Priority Invariant:</strong> AI diagnostic recommendations are advisory only and cannot override deterministic policy stopping rules.
        </span>
        <EvidenceSourceBadge scope="OPERATIONAL_ONLY" label="8 ACTIVE RULES" />
      </div>

      {/* 2. Active Policy Configuration Parameters */}
      <div className="metrics-row rhythm-24">
        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Max Attempts Cap</span>
            <span className="badge-base badge-neutral">HARD LIMIT</span>
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            {defaultPolicy.maxAttempts} Attempts
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Subsequent attempts strictly blocked
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Mandatory Cooling Cadence</span>
            <span className="badge-base badge-neutral">BACKOFF</span>
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--accent-primary)", margin: "4px 0" }}>
            {defaultPolicy.coolingPeriodMinutes} Minutes
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Enforces delay between attempt dispatches
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Link Expiry Window</span>
            <span className="badge-base badge-neutral">TTL</span>
          </div>
          <div className="text-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)", margin: "4px 0" }}>
            {Math.round(defaultPolicy.linkExpiryMinutes / 60)} Hours
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Razorpay link expiration time-to-live
          </p>
        </div>

        <div className="ops-panel">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-2)" }}>
            <span className="text-caption">Auto-Refund Remediation</span>
            <span className="badge-base badge-neutral">SAFETY</span>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: defaultPolicy.autoRefundEnabled ? "var(--success-text)" : "var(--warning-text)", margin: "4px 0" }}>
            {defaultPolicy.autoRefundEnabled ? "Enabled" : "Manual Queue"}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Double-payment race resolution policy
          </p>
        </div>
      </div>

      {/* 3. Stopping Rules Specification Table */}
      <div className="ops-panel" style={{ padding: "0" }}>
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--border-subtle)" }}>
          <h2 className="text-h2">Deterministic Stopping Rules Specification</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "2px" }}>
            Pure policy engine rules evaluated in deterministic order before any recovery link generation.
          </p>
        </div>

        <div className="ops-table-container" style={{ border: "none", borderRadius: "0" }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: "240px" }}>Rule Name</th>
                <th>Trigger Condition</th>
                <th style={{ width: "160px" }}>Policy Action</th>
                <th>Behavioral Rationale</th>
              </tr>
            </thead>
            <tbody>
              {STOPPING_RULES.map((r) => (
                <tr key={r.rule}>
                  <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {r.rule}
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <code>{r.condition}</code>
                  </td>
                  <td>
                    <span
                      className={`badge-base ${
                        r.action === "STOP" ? "badge-danger" : "badge-warning"
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {r.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
