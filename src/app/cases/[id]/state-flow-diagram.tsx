import React from "react";
import { CaseStatus } from "@prisma/client";
import { Check } from "lucide-react";

interface StateFlowProps {
  status: CaseStatus;
  attemptsCount: number;
  hasDuplicateRisk: boolean;
}

export function StateFlowDiagram({ status, attemptsCount, hasDuplicateRisk }: StateFlowProps) {
  // Determine active stage (1 to 5)
  let activeStage = 1;

  if (status === CaseStatus.RECOVERED) {
    activeStage = 4;
  } else if (status === CaseStatus.MANUAL_REVIEW || status === CaseStatus.CLOSED || status === CaseStatus.FAILED) {
    activeStage = 4;
  } else if (attemptsCount > 0) {
    activeStage = 3;
  } else {
    activeStage = 2;
  }

  const STAGES = [
    { num: 1, label: "1. Ingested Risk", sub: "Webhook Ingestion" },
    { num: 2, label: "2. Bounded Policy", sub: "Deterministic Rules" },
    { num: 3, label: "3. Outbound Attempt", sub: "Provider Link" },
    {
      num: 4,
      label: status === CaseStatus.RECOVERED ? "4. Captured Settlement" : "4. Manual Review / Stop",
      sub: status === CaseStatus.RECOVERED ? "HMAC Verified" : "Policy Halted",
    },
    { num: 5, label: "5. Audit Provenance", sub: "Immutable Trail" },
  ];

  return (
    <div
      role="region"
      aria-label="Recovery Lifecycle State Flow"
      className="ops-panel rhythm-24"
      style={{ padding: "var(--space-4)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--space-3)",
        }}
      >
        <span className="text-caption" style={{ fontWeight: 700 }}>
          Deterministic Lifecycle Stage
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {hasDuplicateRisk && (
            <span className="badge-base badge-danger">
              DUPLICATE RISK LOCKED
            </span>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Stage {activeStage} of 5
          </span>
        </div>
      </div>

      {/* Flat Stage Stepper Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "8px",
        }}
      >
        {STAGES.map((s) => {
          const isPassed = s.num < activeStage || (s.num === 4 && status === CaseStatus.RECOVERED);
          const isCurrent = s.num === activeStage;

          let borderColor = "var(--border-subtle)";
          let bg = "var(--bg-app)";
          let textColor = "var(--text-muted)";

          if (isPassed) {
            borderColor = "var(--success-border)";
            bg = "var(--success-subtle)";
            textColor = "var(--success-text)";
          } else if (isCurrent) {
            if (status === CaseStatus.RECOVERED) {
              borderColor = "var(--success-border)";
              bg = "var(--success-subtle)";
              textColor = "var(--success-text)";
            } else if (status === CaseStatus.MANUAL_REVIEW) {
              borderColor = "var(--warning-border)";
              bg = "var(--warning-subtle)";
              textColor = "var(--warning-text)";
            } else {
              borderColor = "var(--accent-border)";
              bg = "var(--accent-subtle)";
              textColor = "var(--accent-primary)";
            }
          }

          return (
            <div
              key={s.num}
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                borderRadius: "var(--radius-sm)",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: isPassed ? "var(--success-primary)" : "var(--bg-app)",
                    color: isPassed ? "#040806" : textColor,
                    border: `1px solid ${borderColor}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.625rem",
                    fontWeight: 700,
                  }}
                >
                  {isPassed ? <Check size={11} strokeWidth={3} /> : s.num}
                </div>
                {isCurrent && (
                  <span
                    style={{
                      fontSize: "0.5625rem",
                      fontWeight: 700,
                      color: textColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    Active
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? "var(--text-primary)" : textColor,
                }}
              >
                {s.label}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                {s.sub}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
