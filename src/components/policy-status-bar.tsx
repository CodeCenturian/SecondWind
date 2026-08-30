import React from "react";
import Link from "next/link";

interface PolicyStatusBarProps {
  maxAttempts?: number;
  coolingPeriodMinutes?: number;
  floorMinor?: bigint | number;
  ceilingMinor?: bigint | number;
  ruleCount?: number;
}

export function PolicyStatusBar({
  maxAttempts = 3,
  coolingPeriodMinutes = 30,
  floorMinor = 100n,
  ceilingMinor = 1000000n,
  ruleCount = 8,
}: PolicyStatusBarProps) {
  const floorRupees = Number(floorMinor) / 100;
  const ceilingRupees = Number(ceilingMinor) / 100;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid var(--gold-primary)",
        borderRadius: "var(--radius-md)",
        padding: "8px var(--space-4)",
        marginBottom: "var(--space-6)",
        gap: "var(--space-4)",
        flexWrap: "wrap",
      }}
      role="status"
      aria-label="Merchant Recovery Policy Operational Guardrails"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: "var(--gold-primary)", fontSize: "0.875rem", fontWeight: 700 }}>●</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Recovery Policy Active
          </span>
        </div>

        <div style={{ width: "1px", height: "14px", background: "var(--border-default)" }} className="hide-mobile" />

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", fontSize: "0.75rem", color: "var(--text-secondary)", flexWrap: "wrap" }}>
          <span>
            Max Attempts: <strong style={{ color: "var(--text-primary)" }}>{maxAttempts}</strong>
          </span>
          <span>•</span>
          <span>
            Cooling: <strong style={{ color: "var(--text-primary)" }}>{coolingPeriodMinutes}m</strong>
          </span>
          <span>•</span>
          <span>
            Bounds: <strong style={{ color: "var(--gold-text)" }}>₹{floorRupees.toFixed(2)} – ₹{ceilingRupees.toLocaleString("en-IN")}</strong>
          </span>
          <span>•</span>
          <span>
            Rules: <strong style={{ color: "var(--text-primary)" }}>{ruleCount} Deterministic</strong>
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
          AI Advisory Invariant: Zero Override Authority
        </span>
        <Link
          href="/policy"
          style={{
            fontSize: "0.75rem",
            color: "var(--gold-text)",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          View Rules →
        </Link>
      </div>
    </div>
  );
}
