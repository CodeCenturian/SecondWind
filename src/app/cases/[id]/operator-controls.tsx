"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CaseStatus } from "@prisma/client";
import { ConfirmActionDialog } from "@/components/confirm-dialog";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConfirm(reason: string) {
    if (!selectedAction) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/cases/${caseId}/operator-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: selectedAction,
          reason,
          expectedVersion: currentVersion,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to execute operator governance action.");
      } else {
        setSelectedAction(null);
        router.refresh();
      }
    } catch (err) {
      setErrorMessage(`Network error: ${(err as Error).message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const actionMeta = {
    ESCALATE_TO_MANUAL_REVIEW: {
      title: "Escalate Case to Manual Review",
      description: "Quarantines this case into the human operator queue, halting all automated recovery link dispatches until operator sign-off.",
      actionName: "Confirm Escalation",
      isDestructive: false,
    },
    CLOSE_CASE: {
      title: "Close Case & Permanently Halt Recovery",
      description: "Transitions this case into a terminal CLOSED state. No further payment links will be generated or dispatched.",
      actionName: "Confirm Case Closure",
      isDestructive: true,
    },
    REOPEN_FOR_RECOVERY: {
      title: "Reopen Case for Policy Pipeline",
      description: "Clears manual quarantine or closed state, returning the case to the active deterministic policy evaluation pipeline.",
      actionName: "Confirm Reopening",
      isDestructive: false,
    },
  }[selectedAction || ""] || {
    title: "Confirm Governance Action",
    description: "Are you sure you want to perform this operator governance action?",
    actionName: "Confirm",
    isDestructive: false,
  };

  return (
    <div
      className="ops-panel rhythm-24"
      style={{
        padding: "var(--space-3) var(--space-4)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "var(--space-3)",
        background: "var(--bg-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span className="text-caption" style={{ fontWeight: 700 }}>
          Operator Governance:
        </span>
        <span className="code-inline" style={{ fontSize: "0.6875rem" }}>
          Lock Version v{currentVersion}
        </span>
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {currentStatus !== CaseStatus.MANUAL_REVIEW && (
          <button
            onClick={() => {
              setSelectedAction("ESCALATE_TO_MANUAL_REVIEW");
              setErrorMessage(null);
            }}
            className="btn btn-secondary btn-sm"
          >
            Escalate to Review
          </button>
        )}

        {currentStatus !== CaseStatus.CLOSED && (
          <button
            onClick={() => {
              setSelectedAction("CLOSE_CASE");
              setErrorMessage(null);
            }}
            className="btn btn-secondary btn-sm"
            style={{ color: "var(--danger-text)" }}
          >
            Close / Halt
          </button>
        )}

        {(currentStatus === CaseStatus.MANUAL_REVIEW || currentStatus === CaseStatus.CLOSED) && (
          <button
            onClick={() => {
              setSelectedAction("REOPEN_FOR_RECOVERY");
              setErrorMessage(null);
            }}
            className="btn btn-primary btn-sm"
          >
            Reopen Pipeline
          </button>
        )}
      </div>

      <ConfirmActionDialog
        isOpen={Boolean(selectedAction)}
        title={actionMeta.title}
        description={actionMeta.description}
        actionName={actionMeta.actionName}
        expectedVersion={currentVersion}
        isDestructive={actionMeta.isDestructive}
        loading={isSubmitting}
        error={errorMessage}
        onConfirm={handleConfirm}
        onCancel={() => setSelectedAction(null)}
      />
    </div>
  );
}
