import React from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  badge,
  actions,
}: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "var(--space-4)",
        flexWrap: "wrap",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ maxWidth: "780px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <h1 className="text-h1">{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-body" style={{ marginTop: "var(--space-1)" }}>
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}
