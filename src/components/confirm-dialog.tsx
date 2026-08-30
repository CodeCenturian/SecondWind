"use client";

import React, { useState } from "react";

interface ConfirmActionDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  actionName: string;
  expectedVersion?: number;
  isDestructive?: boolean;
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => Promise<void> | void;
  onCancel: () => void;
}

export function ConfirmActionDialog({
  isOpen,
  title,
  description,
  actionName,
  expectedVersion,
  isDestructive = false,
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setValidationError("An explicit reason is required to maintain the immutable audit trail.");
      return;
    }
    setValidationError(null);
    onConfirm(reason.trim());
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "var(--space-4)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div
        className="ops-panel-elevated"
        style={{
          maxWidth: "480px",
          width: "100%",
          padding: "var(--space-6)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2 id="dialog-title" className="text-h2" style={{ marginBottom: "var(--space-2)" }}>
          {title}
        </h2>

        <p className="text-body" style={{ marginBottom: "var(--space-4)" }}>
          {description}
        </p>

        {expectedVersion !== undefined && (
          <div
            style={{
              padding: "6px 10px",
              background: "var(--neutral-subtle)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-xs)",
              fontSize: "0.6875rem",
              color: "var(--text-muted)",
              marginBottom: "var(--space-4)",
            }}
          >
            Optimistic Version Lock: <strong className="text-mono" style={{ color: "var(--text-primary)" }}>v{expectedVersion}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <label
              htmlFor="audit-reason"
              className="text-caption"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Operator Audit Reason (Required)
            </label>
            <textarea
              id="audit-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="Provide justification for this state change..."
              rows={3}
              className="ops-textarea"
              required
              disabled={loading}
            />
            {validationError && (
              <p style={{ color: "var(--danger-text)", fontSize: "0.75rem", marginTop: "4px" }}>
                {validationError}
              </p>
            )}
          </div>

          {(error || validationError) && (
            <div style={{ color: "var(--danger-text)", fontSize: "0.75rem", marginBottom: "var(--space-3)" }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary btn-sm"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn btn-sm ${isDestructive ? "btn-danger" : "btn-primary"}`}
              disabled={loading}
            >
              {loading ? "Recording Action..." : actionName}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
