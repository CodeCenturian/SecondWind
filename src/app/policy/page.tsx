import { prisma } from "@/lib/db";
import Link from "next/link";

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
      description: "Permanently halts link dispatch to prevent double recovery or spamming dead cases.",
    },
    {
      rule: "2. Adversarial Duplicate Payment Race",
      condition: "Late original payment event arrives after recovery settled",
      action: "MANUAL_REVIEW",
      description: "Flags DUPLICATE_RISK, stops recovery actions, and queues RefundTask for operator review.",
    },
    {
      rule: "3. Customer Opt-Out / Do Not Contact",
      condition: "Customer marked isDoNotContact = true",
      action: "STOP",
      description: "Enforces strict privacy and consent compliance; halts all outbound messages.",
    },
    {
      rule: "4. Maximum Attempts Limit Exceeded",
      condition: "Case has reached policy cap (3 attempts)",
      action: "STOP",
      description: "Caps retry fatigue and prevents endless automated notifications.",
    },
    {
      rule: "5. Active Cooling Period",
      condition: "Less than 30 minutes elapsed since previous attempt",
      action: "STOP",
      description: "Enforces non-harassment backoff cadence between recovery dispatches.",
    },
    {
      rule: "6. Missing Customer Contact Info",
      condition: "Neither customerEmail nor customerPhone is present",
      action: "STOP",
      description: "Rejects delivery if no valid channel endpoint exists.",
    },
    {
      rule: "7. Amount Below Policy Floor (< ₹1.00)",
      condition: "Amount is less than 100 minor units",
      action: "STOP",
      description: "Prevents uneconomical micro-transaction link generation.",
    },
    {
      rule: "8. High Value / Currency Ambiguity",
      condition: "Amount exceeds ₹10,000.00 cap or non-INR currency",
      action: "MANUAL_REVIEW",
      description: "Routes high-risk or cross-border payments for operator sign-off.",
    },
  ];

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Header */}
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
              Merchant Policy Engine & Stopping Rules
            </h1>
            <span
              style={{
                background: "rgba(99, 102, 241, 0.15)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
                borderRadius: "9999px",
                padding: "0.25rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--accent-primary)",
              }}
            >
              DETERMINISTIC CONSTRAINTS
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
            Deterministic rule specifications governing automated recovery link generation, cooling periods, attempt limits, and safety stopping boundaries.
          </p>
        </div>

        <div className="badge badge-disclaimer">
          🔒 Invariant: AI diagnosis never overrides deterministic policy stopping rules
        </div>
      </div>

      {/* Active Policy Configuration Parameters */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Max Recovery Attempts
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              POLICY CAP
            </span>
          </div>
          <div className="metric-value" style={{ color: "#fff" }}>
            {defaultPolicy.maxAttempts} Attempts
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Subsequent attempts strictly blocked
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Mandatory Cooling Period
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              CADENCE
            </span>
          </div>
          <div className="metric-value" style={{ color: "#60a5fa" }}>
            {defaultPolicy.coolingPeriodMinutes} Minutes
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Enforces delay between attempt dispatches
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Payment Link Expiry
            </span>
            <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
              PROVIDER TTL
            </span>
          </div>
          <div className="metric-value" style={{ color: "#34d399" }}>
            {defaultPolicy.linkExpiryMinutes / 60} Hours
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Configured in Razorpay link creation payload
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Auto-Refund Default
            </span>
            <span
              className={`badge ${defaultPolicy.autoRefundEnabled ? "badge-recovered" : "badge-detected"}`}
              style={{ fontSize: "0.6875rem" }}
            >
              {defaultPolicy.autoRefundEnabled ? "ENABLED" : "SAFE DEFAULT OFF"}
            </span>
          </div>
          <div className="metric-value" style={{ color: defaultPolicy.autoRefundEnabled ? "#34d399" : "#fbbf24" }}>
            {defaultPolicy.autoRefundEnabled ? "Active" : "Disabled"}
          </div>
          <div className="metric-sub" style={{ marginTop: "0.5rem" }}>
            Adversarial duplicate races route to Operator Queue
          </div>
        </div>
      </div>

      {/* Stopping Rules Catalog Table */}
      <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
        <div style={{ marginBottom: "1.25rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff" }}>
            Deterministic Policy Rules Catalog
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
            Pure, side-effect-free policy engine evaluating 8 safety boundaries before any recovery link can be created.
          </p>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Trigger Condition</th>
                <th>Policy Outcome</th>
                <th>Safety Objective & Behavior</th>
              </tr>
            </thead>
            <tbody>
              {STOPPING_RULES.map((sr, idx) => (
                <tr key={idx}>
                  <td style={{ fontWeight: 600, color: "#fff" }}>{sr.rule}</td>
                  <td>
                    <code style={{ fontSize: "0.75rem" }}>{sr.condition}</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sr.action === "STOP"
                          ? "badge-detected"
                          : "badge-system-neutral"
                      }`}
                      style={{ fontSize: "0.6875rem" }}
                    >
                      {sr.action}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    {sr.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/manual-review" className="action-button secondary" style={{ textDecoration: "none" }}>
          ← View Manual Review Queue
        </Link>
        <Link href="/runbook" className="action-button primary" style={{ textDecoration: "none" }}>
          Inspect Test Mode Runbook →
        </Link>
      </div>
    </div>
  );
}
