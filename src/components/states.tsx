import React from "react";
import Link from "next/link";
import { Inbox, AlertCircle, RefreshCw } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionText,
  actionHref,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
        textAlign: "center",
        background: "var(--bg-surface)",
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-surface-elevated)",
          border: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          marginBottom: "var(--space-3)",
        }}
      >
        <Inbox size={20} />
      </div>

      <h3 className="text-h3" style={{ marginBottom: "var(--space-1)" }}>
        {title}
      </h3>

      <p className="text-body" style={{ maxWidth: "460px", marginBottom: "var(--space-4)", fontSize: "0.8125rem" }}>
        {description}
      </p>

      {actionText && actionHref && (
        <Link href={actionHref} className="btn btn-secondary btn-sm">
          {actionText}
        </Link>
      )}

      {actionText && onAction && !actionHref && (
        <button onClick={onAction} className="btn btn-secondary btn-sm">
          {actionText}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title: string;
  description: string;
  retryText?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title,
  description,
  retryText = "Retry",
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
        textAlign: "center",
        background: "var(--bg-surface)",
        border: "1px solid var(--danger-border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "var(--radius-sm)",
          background: "var(--danger-subtle)",
          border: "1px solid var(--danger-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--danger-text)",
          marginBottom: "var(--space-3)",
        }}
      >
        <AlertCircle size={20} />
      </div>

      <h3 className="text-h3" style={{ color: "var(--danger-text)", marginBottom: "var(--space-1)" }}>
        {title}
      </h3>

      <p className="text-body" style={{ maxWidth: "460px", marginBottom: "var(--space-4)", fontSize: "0.8125rem" }}>
        {description}
      </p>

      {onRetry && (
        <button onClick={onRetry} className="btn btn-secondary btn-sm">
          <RefreshCw size={13} />
          <span>{retryText}</span>
        </button>
      )}
    </div>
  );
}

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading operational data..." }: LoadingStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-8) var(--space-4)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "24px",
          height: "24px",
          border: "2px solid var(--border-default)",
          borderTopColor: "var(--accent-primary)",
          borderRadius: "50%",
          animation: "spin 0.6s linear infinite",
          marginBottom: "var(--space-3)",
        }}
      />
      <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>
        {message}
      </span>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
