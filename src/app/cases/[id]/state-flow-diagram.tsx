import { CaseStatus } from "@prisma/client";

interface StateFlowProps {
  status: CaseStatus;
  attemptsCount: number;
  hasDuplicateRisk: boolean;
}

export function StateFlowDiagram({ status, attemptsCount, hasDuplicateRisk }: StateFlowProps) {
  // Determine active stage
  let activeStage = 1; // 1: Detected, 2: Policy, 3: Attempt, 4: Settled / Stopped, 5: Audit & Safety

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
    { num: 1, label: "Detected Risk", sub: "Ingested Failure" },
    { num: 2, label: "Bounded Policy", sub: "Deterministic Rules" },
    { num: 3, label: "Recovery Attempt", sub: "Provider Link" },
    {
      num: 4,
      label: status === CaseStatus.RECOVERED ? "Captured Settlement" : "Manual Review / Stopped",
      sub: status === CaseStatus.RECOVERED ? "Verified Captured" : "Policy Halted",
    },
    { num: 5, label: "Audit & Race Safety", sub: "Provenance Chain" },
  ];

  return (
    <div
      role="region"
      aria-label="Recovery Lifecycle State Flow"
      className="glass-card"
      style={{
        padding: "1.25rem 1.5rem",
        marginBottom: "1.75rem",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", margin: 0 }}>
          Deterministic Lifecycle Stage
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasDuplicateRisk && (
            <span
              style={{
                fontSize: "0.6875rem",
                color: "#f87171",
                background: "rgba(239, 68, 68, 0.15)",
                padding: "0.2rem 0.5rem",
                borderRadius: "9999px",
                fontWeight: 700,
              }}
            >
              DUPLICATE RISK LOCKED
            </span>
          )}
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Stage {activeStage} of 5
          </span>
        </div>
      </div>

      {/* Accessible Flow Stepper */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        {STAGES.map((s) => {
          const isPassed = s.num < activeStage || (s.num === 4 && status === CaseStatus.RECOVERED);
          const isCurrent = s.num === activeStage;

          let badgeColor = "rgba(255, 255, 255, 0.1)";
          let textColor = "var(--text-muted)";
          let borderColor = "var(--border-color)";

          if (isCurrent) {
            if (status === CaseStatus.RECOVERED) {
              badgeColor = "rgba(16, 185, 129, 0.2)";
              textColor = "#34d399";
              borderColor = "#10b981";
            } else if (status === CaseStatus.MANUAL_REVIEW) {
              badgeColor = "rgba(245, 158, 11, 0.2)";
              textColor = "#fbbf24";
              borderColor = "#f59e0b";
            } else {
              badgeColor = "rgba(99, 102, 241, 0.2)";
              textColor = "var(--accent-primary)";
              borderColor = "var(--accent-primary)";
            }
          } else if (isPassed) {
            badgeColor = "rgba(16, 185, 129, 0.12)";
            textColor = "#34d399";
            borderColor = "rgba(16, 185, 129, 0.3)";
          }

          return (
            <div
              key={s.num}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                flex: "1 1 0",
                minWidth: "110px",
              }}
            >
              <div
                style={{
                  width: "2.25rem",
                  height: "2.25rem",
                  borderRadius: "50%",
                  background: badgeColor,
                  border: `2px solid ${borderColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "0.8125rem",
                  color: textColor,
                  marginBottom: "0.35rem",
                  transition: "all 0.2s ease-in-out",
                }}
              >
                {isPassed ? "✓" : s.num}
              </div>
              <span
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? "#fff" : textColor,
                }}
              >
                {s.label}
              </span>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                {s.sub}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
