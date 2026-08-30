"use client";

import React, { useState } from "react";
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
        setActionError(data.error || "Failed to execute policy recovery action");
      } else {
        setActionSuccess(
          `Recovery attempt dispatched via ${selectedChannel}. Payment Link: ${data.attempt.paymentLinkUrl || data.attempt.paymentLinkId}`
        );
        router.refresh();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Network error executing action");
    } finally {
      setLoading(false);
    }
  }

  const outcomeBadge = {
    ALLOW_ACTION: {
      badgeClass: "badge-recovered",
      label: "ACTION PERMITTED BY POLICY",
    },
    MANUAL_REVIEW: {
      badgeClass: "badge-warning",
      label: "MANUAL REVIEW REQUIRED",
    },
    STOP: {
      badgeClass: "badge-danger",
      label: "STOPPED BY DETERMINISTIC RULE",
    },
  }[decision.outcome];

  return (
    <div className="ops-panel rhythm-24">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <h2 className="text-h2">Deterministic Policy Engine Decision</h2>
          <span className="code-inline">Policy v{decision.policyVersion}</span>
        </div>
        <span className={`badge-base ${outcomeBadge.badgeClass}`}>
          {outcomeBadge.label}
        </span>
      </div>

      {/* AI Advisory Alignment & Safety Invariant Banner */}
      {decision.aiAdvisoryAlignment && (
        <div
          style={{
            background: decision.aiAdvisoryAlignment.isOverriddenByPolicy
              ? "var(--danger-subtle)"
              : "var(--bg-app)",
            border: `1px solid ${
              decision.aiAdvisoryAlignment.isOverriddenByPolicy
                ? "var(--danger-border)"
                : "var(--border-subtle)"
            }`,
            borderRadius: "var(--radius-sm)",
            padding: "8px 12px",
            marginBottom: "var(--space-4)",
            fontSize: "0.8125rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)" }}>AI Diagnostic Recommendation: </span>
            <span className="code-inline" style={{ fontWeight: 600 }}>
              {decision.aiAdvisoryAlignment.aiRecommendedHandling || "NONE"}
            </span>
            {decision.aiAdvisoryAlignment.aiConfidence !== undefined && (
              <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>
                ({Math.round(decision.aiAdvisoryAlignment.aiConfidence * 100)}% confidence)
              </span>
            )}
          </div>

          <div>
            {decision.aiAdvisoryAlignment.isOverriddenByPolicy ? (
              <span style={{ color: "var(--danger-text)", fontWeight: 600, fontSize: "0.75rem" }}>
                OVERRIDDEN BY DETERMINISTIC BOUNDARY ({decision.outcome})
              </span>
            ) : (
              <span style={{ color: "var(--success-text)", fontSize: "0.75rem" }}>
                AI recommendation aligned with policy boundaries
              </span>
            )}
          </div>
        </div>
      )}

      {/* Rule Evaluation Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
            Evaluated Decision Reason
          </div>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem" }}>
            {decision.reasons.length > 0 ? decision.reasons.join(" • ") : "No policy rule constraints breached"}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            Next Stopping Rule: {decision.nextStoppingRule} ({decision.remainingAttempts} attempts remaining)
          </div>
        </div>

        <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
            Permitted Outbound Channels
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
            {decision.allowedActionTypes.length > 0 ? (
              decision.allowedActionTypes.map((ch) => (
                <span key={ch} className="code-inline" style={{ color: "var(--accent-primary)" }}>
                  {ch}
                </span>
              ))
            ) : (
              <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                None (Execution Blocked)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dispatch Action Control */}
      {decision.canExecute && (
        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "var(--bg-app)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Dispatch Channel:
            </span>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value as AttemptChannel)}
              className="ops-select"
              style={{ width: "auto", padding: "4px 8px" }}
              disabled={loading}
            >
              {decision.allowedActionTypes.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleTriggerAction}
            disabled={loading}
            className="btn btn-primary btn-sm"
          >
            {loading ? "Generating Link..." : `Trigger Recovery Attempt (${selectedChannel})`}
          </button>
        </div>
      )}

      {/* Action Error / Success Feedback */}
      {actionError && (
        <div
          style={{
            marginTop: "var(--space-3)",
            padding: "8px 12px",
            background: "var(--danger-subtle)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--danger-text)",
            fontSize: "0.8125rem",
          }}
        >
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          style={{
            marginTop: "var(--space-3)",
            padding: "8px 12px",
            background: "var(--success-subtle)",
            border: "1px solid var(--success-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--success-text)",
            fontSize: "0.8125rem",
          }}
        >
          {actionSuccess}
        </div>
      )}
    </div>
  );
}
