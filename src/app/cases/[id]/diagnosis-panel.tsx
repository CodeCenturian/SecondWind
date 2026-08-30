"use client";

import { useState } from "react";
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

  const handlingColors = {
    RETRY_CANDIDATE: {
      bg: "rgba(16, 185, 129, 0.12)",
      border: "rgba(16, 185, 129, 0.3)",
      text: "#34d399",
      label: "RETRY CANDIDATE",
    },
    REQUEST_ALTERNATE_METHOD: {
      bg: "rgba(59, 130, 246, 0.12)",
      border: "rgba(59, 130, 246, 0.3)",
      text: "#60a5fa",
      label: "REQUEST ALTERNATE METHOD",
    },
    MANUAL_REVIEW: {
      bg: "rgba(245, 158, 11, 0.12)",
      border: "rgba(245, 158, 11, 0.3)",
      text: "#fbbf24",
      label: "MANUAL REVIEW REQUIRED",
    },
    STOP: {
      bg: "rgba(239, 68, 68, 0.12)",
      border: "rgba(239, 68, 68, 0.3)",
      text: "#f87171",
      label: "STOP RECOVERY",
    },
  };

  const currentHandling = output ? handlingColors[output.recommendedHandling] : handlingColors.MANUAL_REVIEW;

  const confidencePct = output ? Math.round(output.confidence * 100) : 0;
  const confidenceColor =
    confidencePct >= 85 ? "#34d399" : confidencePct >= 70 ? "#fbbf24" : "#f87171";

  return (
    <div
      className="glass-card"
      style={{
        marginBottom: "2rem",
        border: "1px solid rgba(147, 51, 234, 0.25)",
        background: "linear-gradient(180deg, rgba(147, 51, 234, 0.04) 0%, rgba(15, 23, 42, 0.6) 100%)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              background: "rgba(147, 51, 234, 0.15)",
              border: "1px solid rgba(147, 51, 234, 0.35)",
              borderRadius: "9999px",
              padding: "0.25rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#c084fc",
              letterSpacing: "0.05em",
            }}
          >
            <span>✨ GEMINI FLASH</span>
            <span>•</span>
            <span>AI DIAGNOSIS</span>
          </div>
          <span className="badge badge-system-neutral" style={{ fontSize: "0.6875rem" }}>
            ADVISORY ONLY • NON-AUTHORITATIVE
          </span>
          {diagnosis && (
            <span className="code-pill" style={{ fontSize: "0.6875rem" }}>
              {diagnosis.model} ({diagnosis.promptVersion})
            </span>
          )}
        </div>

        <button
          onClick={handleRunDiagnosis}
          disabled={loading}
          style={{
            background: "linear-gradient(135deg, #9333ea, #7e22ce)",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.45rem 1rem",
            fontWeight: 600,
            fontSize: "0.8125rem",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            boxShadow: "0 2px 8px rgba(147, 51, 234, 0.3)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {loading ? (
            <>
              <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⚙️</span>
              <span>Analyzing with Gemini Flash...</span>
            </>
          ) : diagnosis ? (
            "⚡ Re-run AI Diagnosis"
          ) : (
            "✨ Run AI Semantic Diagnosis"
          )}
        </button>
      </div>

      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            padding: "0.75rem 1rem",
            borderRadius: "0.375rem",
            color: "#fca5a5",
            fontSize: "0.875rem",
            marginBottom: "1.25rem",
          }}
        >
          ✕ {error}
        </div>
      )}

      {/* Privacy Redaction Notice */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.02)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "0.375rem",
          padding: "0.5rem 0.75rem",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <span>🛡️</span>
        <span>
          <strong>Data Minimization Enforced:</strong> Sensitive fields (card numbers, CVVs, expiry dates, webhook signatures, customer PII) were stripped prior to model analysis.
        </span>
      </div>

      {!diagnosis ? (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.015)",
            border: "1px dashed var(--border-color)",
            borderRadius: "0.5rem",
            padding: "1.75rem",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🤖</div>
          <div style={{ fontWeight: 600, color: "#fff", marginBottom: "0.25rem" }}>
            No Semantic Diagnosis Recorded
          </div>
          <div style={{ color: "var(--text-muted)", maxWidth: "450px", margin: "0 auto 1rem" }}>
            Trigger Gemini Flash to classify the payment failure reason, assess recoverability signals, and provide explainable evidence for policy evaluation.
          </div>
          <button
            onClick={handleRunDiagnosis}
            disabled={loading}
            style={{
              background: "rgba(147, 51, 234, 0.2)",
              color: "#c084fc",
              border: "1px solid rgba(147, 51, 234, 0.4)",
              borderRadius: "0.375rem",
              padding: "0.5rem 1.25rem",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Analyzing..." : "Analyze with Gemini Flash"}
          </button>
        </div>
      ) : (
        <div>
          {/* Classification & Confidence Bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            {/* Reason Class */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-color)",
                padding: "0.875rem 1rem",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                Classified Failure Reason
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#c084fc", marginTop: "0.25rem" }}>
                {output?.reasonClass}
              </div>
              {reasonDoc && (
                <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                  {reasonDoc.title}
                </div>
              )}
            </div>

            {/* Confidence Gauge */}
            <div
              style={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--border-color)",
                padding: "0.875rem 1rem",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem" }}>
                <span style={{ color: "var(--text-muted)" }}>Model Confidence</span>
                <span style={{ fontWeight: 700, color: confidenceColor }}>{confidencePct}%</span>
              </div>
              {/* Progress bar */}
              <div
                style={{
                  height: "6px",
                  background: "rgba(255, 255, 255, 0.08)",
                  borderRadius: "9999px",
                  marginTop: "0.5rem",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${confidencePct}%`,
                    background: confidenceColor,
                    borderRadius: "9999px",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.6875rem", marginTop: "0.35rem" }}>
                Threshold for automated policy action: 70%
              </div>
            </div>

            {/* Recommended Handling */}
            <div
              style={{
                background: currentHandling.bg,
                border: `1px solid ${currentHandling.border}`,
                padding: "0.875rem 1rem",
                borderRadius: "0.375rem",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                Advisory Recommendation
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: currentHandling.text, marginTop: "0.25rem" }}>
                {currentHandling.label}
              </div>
              <div style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                Subject to merchant stopping rules
              </div>
            </div>
          </div>

          {/* AI Diagnostic Summary */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-color)",
              borderRadius: "0.375rem",
              padding: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ fontWeight: 600, color: "#fff", fontSize: "0.875rem", marginBottom: "0.35rem" }}>
              Diagnostic Explanation
            </div>
            <div style={{ color: "var(--text-primary)", fontSize: "0.875rem", lineHeight: 1.5 }}>
              {output?.summary}
            </div>
          </div>

          {/* Evidence and Uncertainties Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {/* Evidence List */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                borderRadius: "0.375rem",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: "#34d399",
                  fontSize: "0.8125rem",
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>🔍</span> Observed Evidence ({output?.evidence?.length || 0})
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.25rem",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                {output?.evidence?.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>

            {/* Uncertainties & Caveats */}
            <div
              style={{
                background: "rgba(245, 158, 11, 0.04)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: "0.375rem",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  color: "#fbbf24",
                  fontSize: "0.8125rem",
                  marginBottom: "0.5rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>⚠️</span> Uncertainties & Edge Cases ({output?.uncertainties?.length || 0})
              </div>
              {output?.uncertainties && output.uncertainties.length > 0 ? (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "1.25rem",
                    color: "var(--text-secondary)",
                    fontSize: "0.8125rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.35rem",
                  }}
                >
                  {output.uncertainties.map((unc, idx) => (
                    <li key={idx}>{unc}</li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                  No significant diagnostic uncertainties flagged.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
