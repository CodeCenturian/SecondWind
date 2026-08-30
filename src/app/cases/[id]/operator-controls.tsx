"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CaseStatus } from "@prisma/client";

interface OperatorControlsProps {
  caseId: string;
  currentStatus: CaseStatus;
  currentVersion: number;
}

export function OperatorControls({
  caseId,
  currentStatus,
  currentVersion,
}: OperatorControlsProps) {
  const router = useRouter();
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirmAction() {
    if (!selectedAction || !reason.trim()) {
      setErrorMessage("Please enter an explicit reason for this operator audit log.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/operator-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          reason: reason.trim(),
          expectedVersion: currentVersion,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to execute operator action.");
      } else {
        setSelectedAction(null);
        setReason("");
        router.refresh();
      }
    } catch (err) {
      setErrorMessage(`Network error: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="glass-card"
      style={{
        padding: "1.25rem 1.5rem",
        marginBottom: "1.75rem",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#fff", margin: 0 }}>
          Operator Actions & Governance
        </h3>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Lock Version: {currentVersion}
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        {currentStatus !== CaseStatus.MANUAL_REVIEW && (
          <button
            onClick={() => {
              setSelectedAction("ESCALATE_TO_MANUAL_REVIEW");
              setErrorMessage(null);
            }}
            className="action-button secondary"
            style={{ fontSize: "0.8125rem", padding: "0.4rem 0.85rem" }}
          >
            Escalate to Manual Review
          </button>
        )}

        {currentStatus !== CaseStatus.CLOSED && (
          <button
            onClick={() => {
              setSelectedAction("CLOSE_CASE");
              setErrorMessage(null);
            }}
            className="action-button secondary"
            style={{ fontSize: "0.8125rem", padding: "0.4rem 0.85rem", color: "#f87171" }}
          >
            Close / Halt Recovery
          </button>
        )}

        {(currentStatus === CaseStatus.MANUAL_REVIEW || currentStatus === CaseStatus.CLOSED) && (
          <button
            onClick={() => {
              setSelectedAction("REOPEN_FOR_RECOVERY");
              setErrorMessage(null);
            }}
            className="action-button primary"
            style={{ fontSize: "0.8125rem", padding: "0.4rem 0.85rem" }}
          >
            Reopen for Policy Pipeline
          </button>
        )}
      </div>

      {/* Confirmation Modal / Form */}
      {selectedAction && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "1rem",
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "0.5rem",
          }}
        >
          <div style={{ fontWeight: 600, color: "#fff", marginBottom: "0.5rem", fontSize: "0.875rem" }}>
            Confirm Operator Action: <code>{selectedAction}</code>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
            This action will atomically increment the case version and record an immutable audit entry with actor type <code>OPERATOR</code>.
          </p>

          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason for audit record (required)..."
            rows={2}
            style={{
              width: "100%",
              padding: "0.5rem",
              background: "rgba(0, 0, 0, 0.4)",
              border: "1px solid var(--border-color)",
              borderRadius: "0.375rem",
              color: "#fff",
              fontSize: "0.8125rem",
              marginBottom: "0.75rem",
              fontFamily: "inherit",
            }}
          />

          {errorMessage && (
            <div style={{ color: "#f87171", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>
              ⚠️ {errorMessage}
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setSelectedAction(null)}
              disabled={isSubmitting}
              className="action-button secondary"
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.8125rem" }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              disabled={isSubmitting}
              className="action-button primary"
              style={{ padding: "0.35rem 0.85rem", fontSize: "0.8125rem" }}
            >
              {isSubmitting ? "Executing..." : "Confirm & Sign Audit Log →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
