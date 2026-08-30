"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PersistedAiDiagnosis, REASON_CLASS_DOCUMENTATION } from "@/lib/ai/taxonomy";

interface DiagnosisPanelProps {
  caseId: string;
  initialDiagnosis: PersistedAiDiagnosis | null;
  onDiagnosisUpdated?: (newDiagnosis: PersistedAiDiagnosis) => void;
}

export function DiagnosisPanel({
  caseId,
  initialDiagnosis,
  onDiagnosisUpdated,
}: DiagnosisPanelProps) {
  const router = useRouter();
  const [diagnosis, setDiagnosis] = useState<PersistedAiDiagnosis | null>(initialDiagnosis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunDiagnosis() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/cases/${caseId}/diagnose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to execute AI diagnosis");
      } else {
        setDiagnosis(data.diagnosis);
        if (onDiagnosisUpdated) {
          onDiagnosisUpdated(data.diagnosis);
        }
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error triggering AI diagnosis");
    } finally {
      setLoading(false);
    }
  }

  const output = diagnosis?.structuredOutput;
  const reasonDoc = output ? REASON_CLASS_DOCUMENTATION[output.reasonClass] : null;

  const handlingBadge = {
    RETRY_CANDIDATE: "badge-recovered",
    REQUEST_ALTERNATE_METHOD: "badge-accent",
    MANUAL_REVIEW: "badge-warning",
    STOP: "badge-danger",
  }[output?.recommendedHandling || "MANUAL_REVIEW"];

  const confidencePct = output ? Math.round(output.confidence * 100) : 0;

  return (
    <div className="ops-panel rhythm-24" style={{ background: "var(--bg-surface)" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <h2 className="text-h2">AI Semantic Diagnosis (Advisory)</h2>
          <span className="badge-base badge-neutral">
            NON-AUTHORITATIVE ADVISORY
          </span>
          {diagnosis && (
            <span className="code-inline">
              {diagnosis.model} ({diagnosis.promptVersion})
            </span>
          )}
        </div>

        <button
          onClick={handleRunDiagnosis}
          disabled={loading}
          className="btn btn-secondary btn-sm"
        >
          {loading ? "Analyzing..." : diagnosis ? "Re-run AI Diagnosis" : "Run AI Diagnosis"}
        </button>
      </div>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--danger-subtle)",
            border: "1px solid var(--danger-border)",
            borderRadius: "var(--radius-sm)",
            color: "var(--danger-text)",
            fontSize: "0.8125rem",
            marginBottom: "var(--space-4)",
          }}
        >
          {error}
        </div>
      )}

      {!diagnosis ? (
        <div
          style={{
            padding: "var(--space-6) var(--space-4)",
            textAlign: "center",
            background: "var(--bg-app)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <p className="text-body" style={{ marginBottom: "var(--space-3)" }}>
            No AI semantic diagnosis has been executed for this case yet.
          </p>
          <button
            onClick={handleRunDiagnosis}
            disabled={loading}
            className="btn btn-primary btn-sm"
          >
            {loading ? "Analyzing with Gemini..." : "Generate AI Diagnosis"}
          </button>
        </div>
      ) : output ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {/* Top Metrics Row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Classified Reason
              </div>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {output.reasonClass}
              </div>
              {reasonDoc && (
                <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                  {reasonDoc.description}
                </div>
              )}
            </div>

            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Recommended Handling
              </div>
              <div style={{ marginTop: "2px" }}>
                <span className={`badge-base ${handlingBadge}`}>
                  {output.recommendedHandling}
                </span>
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {reasonDoc?.typicallyRecoverable ? "Typically Recoverable" : "Non-Recoverable"}
              </div>
            </div>

            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Diagnosis Confidence
              </div>
              <div className="text-mono" style={{ fontWeight: 700, fontSize: "1.125rem", color: confidencePct >= 75 ? "var(--success-text)" : "var(--warning-text)" }}>
                {confidencePct}%
              </div>
            </div>

            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Evaluated At
              </div>
              <div className="text-mono" style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>
                {new Date(diagnosis.evaluatedAt).toLocaleTimeString("en-IN")}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: "2px" }}>
                Validation: {diagnosis.validationStatus}
              </div>
            </div>
          </div>

          {/* Diagnostic Summary & Observations */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Diagnostic Summary
              </div>
              <p className="text-body" style={{ fontSize: "0.8125rem" }}>
                {output.summary}
              </p>
            </div>

            <div style={{ background: "var(--bg-app)", padding: "var(--space-3)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-caption" style={{ marginBottom: "var(--space-1)" }}>
                Evidence Observations ({output.evidence.length})
              </div>
              <ul style={{ paddingLeft: "16px", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {output.evidence.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: "2px" }}>
                    {item}
                  </li>
                ))}
              </ul>
              {output.uncertainties.length > 0 && (
                <div style={{ marginTop: "6px", fontSize: "0.6875rem", color: "var(--warning-text)" }}>
                  Uncertainties: {output.uncertainties.join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
