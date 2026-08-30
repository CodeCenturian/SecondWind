import React from "react";

export interface AuditLogItem {
  id: string;
  action: string;
  actorType: string;
  actorId?: string | null;
  reason?: string | null;
  previousState?: unknown;
  newState?: unknown;
  createdAt: Date | string;
}

interface AuditTimelineProps {
  logs: AuditLogItem[];
  title?: string;
}

export function AuditTimeline({ logs, title }: AuditTimelineProps) {
  if (!logs || logs.length === 0) {
    return (
      <div style={{ padding: "var(--space-4)", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
        No audit entries recorded for this case.
      </div>
    );
  }

  return (
    <div>
      {title && (
        <h3 className="text-h3" style={{ marginBottom: "var(--space-4)" }}>
          {title} ({logs.length})
        </h3>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          position: "relative",
          paddingLeft: "var(--space-6)",
        }}
      >
        {/* Continuous 1px Vertical Spine */}
        <div
          style={{
            position: "absolute",
            left: "7px",
            top: "6px",
            bottom: "6px",
            width: "1px",
            background: "var(--border-default)",
          }}
          aria-hidden="true"
        />

        {logs.map((log) => {
          const dateStr = new Date(log.createdAt).toLocaleString("en-IN", {
            dateStyle: "short",
            timeStyle: "medium",
          });

          let actorBadgeClass = "badge-neutral";
          if (log.actorType === "OPERATOR") actorBadgeClass = "badge-accent";
          if (log.actorType === "SYSTEM") actorBadgeClass = "badge-neutral";
          if (log.actorType === "WEBHOOK") actorBadgeClass = "badge-recovered";

          return (
            <div
              key={log.id}
              style={{
                position: "relative",
                marginBottom: "var(--space-4)",
              }}
            >
              {/* Timeline Marker (4px square marker on spine) */}
              <div
                style={{
                  position: "absolute",
                  left: "calc(-1 * var(--space-6) + 4px)",
                  top: "6px",
                  width: "7px",
                  height: "7px",
                  background: "var(--accent-primary)",
                  borderRadius: "var(--radius-xs)",
                }}
                aria-hidden="true"
              />

              {/* Log Card */}
              <div
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-3) var(--space-4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    flexWrap: "wrap",
                    marginBottom: "4px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span className={`badge-base ${actorBadgeClass}`} style={{ fontSize: "0.625rem" }}>
                      {log.actorType}
                    </span>
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                      {log.action}
                    </span>
                  </div>

                  <span className="text-mono" style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                    {dateStr}
                  </span>
                </div>

                {log.reason && (
                  <p className="text-body" style={{ fontSize: "0.75rem", marginTop: "4px", color: "var(--text-secondary)" }}>
                    {typeof log.reason === "string" ? log.reason : JSON.stringify(log.reason)}
                  </p>
                )}

                {Boolean(log.newState) && (
                  <details style={{ marginTop: "var(--space-2)" }}>
                    <summary
                      style={{
                        fontSize: "0.6875rem",
                        color: "var(--accent-primary)",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      View State Transition Payload
                    </summary>
                    <pre
                      className="code-inline text-mono"
                      style={{
                        display: "block",
                        marginTop: "4px",
                        padding: "8px",
                        fontSize: "0.6875rem",
                        maxHeight: "160px",
                        overflowX: "auto",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {JSON.stringify(log.newState, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
