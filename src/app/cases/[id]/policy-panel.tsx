"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PolicyDecision } from "@/lib/policy/types";
import { AttemptChannel } from "@prisma/client";

interface PolicyPanelProps {
  caseId: string;
  caseVersion: number;
  initialDecision: PolicyDecision;
}

export function PolicyPanel({
  caseId,
  caseVersion,
  initialDecision,
}: PolicyPanelProps) {
  const router = useRouter();
  const [decision] = useState<PolicyDecision>(initialDecision);
  const [selectedChannel, setSelectedChannel] = useState<AttemptChannel>(
    initialDecision.allowedActionTypes[0] || AttemptChannel.PAYMENT_LINK
  );
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function handleTriggerAction() {
    if (!decision.canExecute) return;

    setLoading(true);
    setActionError(null);
    setActionSuccess(null);

    const idempotencyKey = `act_${caseId}_v${caseVersion}_${Date.now()}`;

    try {
      const response = await fetch(`/api/cases/${caseId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: selectedChannel,
          idempotencyKey,
          expectedVersion: caseVersion,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setActionError(data.error || "Failed to trigger recovery action");
      } else {
        setActionSuccess(
          `Recovery action triggered successfully via ${selectedChannel}. Payment Link: ${data.attempt.paymentLinkUrl || data.attempt.paymentLinkId}`
        );
        router.refresh();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Network error executing action");
    } finally {
      setLoading(false);
    }
  }

  const outcomeColors = {
    ALLOW_ACTION: {
      bg: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.3)",
      text: "#34d399",
      badge: "badge-recovered",
      label: "ELIGIBLE FOR RECOVERY ACTION",
    },
    MANUAL_REVIEW: {
      bg: "rgba(245, 158, 11, 0.12)",
      border: "rgba(245, 158, 11, 0.3)",
      text: "#fbbf24",
      badge: "badge-detected",
      label: "MANUAL REVIEW REQUIRED",
    },
    STOP: {
      bg: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.3)",
      text: "#f87171",
      badge: "badge-system-neutral",
      label: "RECOVERY STOPPED BY POLICY",
    },
  }[decision.outcome];

  return (
    <div className="glass-card" style={{ marginBottom: "2rem" }}>
      {/* Header */}
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#fff" }}>
            Deterministic Policy Engine Evaluation
          </h2>
          <span className="code-pill">Policy {decision.policyVersion}</span>
        </div>
        <span className={`badge ${outcomeColors.badge}`}>{outcomeColors.label}</span>
      </div>

      {/* AI Advisory Alignment & Policy Authority Banner */}
      {decision.aiAdvisoryAlignment && (
        <div
          style={{
            background: decision.aiAdvisoryAlignment.isOverriddenByPolicy
              ? "rgba(239, 68, 68, 0.08)"
              : "rgba(16, 185, 129, 0.08)",
            border: `1px solid ${
              decision.aiAdvisoryAlignment.isOverriddenByPolicy
                ? "rgba(239, 68, 68, 0.25)"
                : "rgba(16, 185, 129, 0.25)"
            }`,
            borderRadius: "0.5rem",
            padding: "0.875rem 1.25rem",
            marginBottom: "1rem",
            fontSize: "0.8125rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)" }}>AI Diagnostic Recommendation: </span>
            <span className="code-pill" style={{ fontWeight: 600 }}>
              {decision.aiAdvisoryAlignment.aiRecommendedHandling || "NONE"}
            </span>
            {decision.aiAdvisoryAlignment.aiConfidence !== undefined && (
              <span style={{ color: "var(--text-muted)", marginLeft: "0.35rem" }}>
                ({Math.round(decision.aiAdvisoryAlignment.aiConfidence * 100)}% conf)
              </span>
            )}
          </div>

          <div>
            {decision.aiAdvisoryAlignment.isOverriddenByPolicy ? (
              <span
                style={{
                  color: "#f87171",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>🛑 OVERRIDDEN BY MERCHANT POLICY</span>
              </span>
            ) : (
              <span
                style={{
                  color: "#34d399",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>✓ ALIGNED WITH MERCHANT POLICY</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Outcome Banner */}
      <div
        style={{
          background: outcomeColors.bg,
          border: `1px solid ${outcomeColors.border}`,
          borderRadius: "0.5rem",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
        }}
      >
        <div style={{ fontWeight: 600, color: outcomeColors.text, fontSize: "0.9375rem" }}>
          Deterministic Policy Outcome: {decision.outcome}
        </div>
        <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.35rem" }}>
          {decision.nextStoppingRule}
        </div>
      </div>

      {/* Policy Diagnostics Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
          fontSize: "0.875rem",
        }}
      >
        <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "0.75rem 1rem", borderRadius: "0.375rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Remaining Attempts</div>
          <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "#fff", marginTop: "0.25rem" }}>
            {decision.remainingAttempts}
          </div>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "0.75rem 1rem", borderRadius: "0.375rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Allowed Channels</div>
          <div style={{ fontWeight: 600, color: "#fff", marginTop: "0.25rem" }}>
            {decision.allowedActionTypes.length > 0
              ? decision.allowedActionTypes.join(", ")
              : "None"}
          </div>
        </div>

        <div style={{ background: "rgba(255, 255, 255, 0.02)", padding: "0.75rem 1rem", borderRadius: "0.375rem" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>Rule Codes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.25rem" }}>
            {decision.reasons.map((r) => (
              <span key={r} className="code-pill" style={{ fontSize: "0.6875rem" }}>
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Operator Action Trigger Panel */}
      {decision.canExecute ? (
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
            <div>
              <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.9375rem" }}>
                Operator Action Authorization
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                Explicit operator request required. Client cannot bypass allowed action set.
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value as AttemptChannel)}
                style={{
                  background: "#090d16",
                  color: "#fff",
                  border: "1px solid var(--border-color)",
                  borderRadius: "0.375rem",
                  padding: "0.5rem 0.75rem",
                  fontSize: "0.875rem",
                }}
              >
                {decision.allowedActionTypes.map((channel) => (
                  <option key={channel} value={channel}>
                    Channel: {channel}
                  </option>
                ))}
              </select>

              <button
                onClick={handleTriggerAction}
                disabled={loading}
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0.375rem",
                  padding: "0.55rem 1.25rem",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  boxShadow: "0 2px 10px rgba(16, 185, 129, 0.3)",
                }}
              >
                {loading ? "Evaluating & Dispatching..." : `Trigger ${selectedChannel}`}
              </button>
            </div>
          </div>

          {actionSuccess && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                padding: "0.75rem 1rem",
                borderRadius: "0.375rem",
                color: "#34d399",
                fontSize: "0.875rem",
              }}
            >
              ✓ {actionSuccess}
            </div>
          )}

          {actionError && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "0.75rem 1rem",
                borderRadius: "0.375rem",
                color: "#fca5a5",
                fontSize: "0.875rem",
              }}
            >
              ✕ {actionError}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            borderTop: "1px solid var(--border-color)",
            paddingTop: "1rem",
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>🛑 Automated & Manual Action Buttons Disabled:</span>
          <span>Policy rule constraint ({decision.reasons.join(", ")}) active.</span>
        </div>
      )}
    </div>
  );
}
