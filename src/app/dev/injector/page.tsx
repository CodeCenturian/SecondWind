"use client";

import { useState } from "react";
import Link from "next/link";

interface ScenarioCard {
  id: string;
  title: string;
  category: "Webhook & Ingestion" | "Adversarial Races" | "Policy & Network";
  description: string;
  invariantVerified: string;
}

const SCENARIOS: ScenarioCard[] = [
  {
    id: "DUPLICATE_WEBHOOK_DELIVERY",
    title: "1. Duplicate Webhook Delivery",
    category: "Webhook & Ingestion",
    description: "Replays the exact same webhook event ID twice.",
    invariantVerified: "Idempotent claim returns 200 OK without re-running state transitions.",
  },
  {
    id: "OUT_OF_ORDER_EVENTS",
    title: "2. Out-of-Order Events",
    category: "Webhook & Ingestion",
    description: "Delivers a payment.captured webhook for an unrecorded case.",
    invariantVerified: "Fails closed to NO_MATCH without crashing or creating orphaned records.",
  },
  {
    id: "RETRY_AFTER_TIMEOUT",
    title: "3. Retry After Timeout",
    category: "Policy & Network",
    description: "Simulates initial provider timeout followed by successful retry.",
    invariantVerified: "Idempotency key prevents duplicate attempt numbering on retry.",
  },
  {
    id: "LATE_ORIGINAL_AUTHORIZATION",
    title: "4. Late Original Authorization",
    category: "Adversarial Races",
    description: "Original payment captures after recovery link is already settled.",
    invariantVerified: "Flags DUPLICATE_RISK, stops recovery actions, and queues RefundTask.",
  },
  {
    id: "DUPLICATE_RECOVERY_CAPTURE",
    title: "5. Duplicate Recovery Capture",
    category: "Adversarial Races",
    description: "Delivers multiple capture events for the same recovery link.",
    invariantVerified: "Returns ALREADY_RECOVERED without double-counting recovered revenue.",
  },
  {
    id: "PROVIDER_TIMEOUT",
    title: "6. Provider Timeout (504)",
    category: "Policy & Network",
    description: "Simulates 504 Gateway Timeout during payment link creation.",
    invariantVerified: "Audited as PROVIDER_LINK_CREATION_FAILED without corrupting case state.",
  },
  {
    id: "INVALID_EVENT_SHAPE",
    title: "7. Invalid Event Shape",
    category: "Webhook & Ingestion",
    description: "Injects malformed event payload missing critical schema fields.",
    invariantVerified: "Safely rejected and audited as FAILED without unhandled exceptions.",
  },
  {
    id: "POLICY_VERSION_CHANGE",
    title: "8. Policy Version Change",
    category: "Policy & Network",
    description: "Evaluates action against merchant policy that changed version in-flight.",
    invariantVerified: "Rejects stale version and routes to MANUAL_REVIEW.",
  },
  {
    id: "DO_NOT_CONTACT_AFTER_ATTEMPT",
    title: "9. Do-Not-Contact After Attempt",
    category: "Policy & Network",
    description: "Customer opts out (isDoNotContact: true) after initial attempt.",
    invariantVerified: "Immediately returns outcome: STOP with reason CUSTOMER_DO_NOT_CONTACT.",
  },
];

export default function DevInjectorPage() {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    "[SANDBOX_INIT] Developer Event Injector ready. Select a scenario to simulate.",
    "[SAFEGUARD] Zero real Razorpay API calls are permitted.",
  ]);

  async function handleRunScenario(scenarioId: string) {
    setRunningId(scenarioId);
    setExecutionLogs((prev) => [
      ...prev,
      `\n------------------------------------------------------------`,
      `>>> INJECTING SCENARIO: ${scenarioId}...`,
    ]);

    try {
      const res = await fetch("/api/dev/inject-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setExecutionLogs((prev) => [
          ...prev,
          `[ERROR] HTTP ${res.status}: ${data.error || "Simulation failed"}`,
          data.details ? `[DETAILS] ${data.details}` : "",
        ]);
      } else {
        setExecutionLogs((prev) => [
          ...prev,
          ...(data.logs || []),
          `✓ RESULT: ${data.message}`,
        ]);
      }
    } catch (err) {
      setExecutionLogs((prev) => [
        ...prev,
        `[NETWORK_ERROR] Failed to communicate with injector endpoint: ${(err as Error).message}`,
      ]);
    } finally {
      setRunningId(null);
    }
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      {/* Visual Warning Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(245, 158, 11, 0.12) 100%)",
          border: "1px solid rgba(239, 68, 68, 0.4)",
          borderRadius: "0.75rem",
          padding: "1.25rem 1.5rem",
          marginBottom: "2rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <span style={{ fontSize: "1.25rem" }}>⚠️</span>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, color: "#f87171", margin: 0 }}>
            DEVELOPER-ONLY EVENT INJECTOR (LOCAL SIMULATION SANDBOX)
          </h2>
          <span
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              color: "#fca5a5",
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "0.2rem 0.5rem",
              borderRadius: "9999px",
            }}
          >
            PROD GATED
          </span>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0, lineHeight: 1.5 }}>
          This interface is strictly developer-only. It routes synthetic events through internal case services using <code>FakeRazorpayAdapter</code>. <strong>Zero calls are made to Razorpay</strong>, and all generated scenarios are <strong>strictly excluded</strong> from the Verified Test Mode Recovered financial accounting queries.
        </p>
      </div>

      {/* Main Grid: Scenarios & Execution Terminal */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Left Column: Preset Scenarios */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff", margin: 0 }}>
              Deterministic Test Scenarios ({SCENARIOS.length})
            </h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Isolated Sandbox Fixtures
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {SCENARIOS.map((sc) => (
              <div
                key={sc.id}
                className="glass-card"
                style={{
                  padding: "1rem 1.25rem",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#fff", fontSize: "0.9375rem" }}>
                    {sc.title}
                  </span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "0.25rem",
                      background: "rgba(255, 255, 255, 0.06)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {sc.category}
                  </span>
                </div>

                <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>
                  {sc.description}
                </p>

                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--accent-primary)",
                    background: "rgba(99, 102, 241, 0.08)",
                    padding: "0.35rem 0.6rem",
                    borderRadius: "0.375rem",
                    border: "1px solid rgba(99, 102, 241, 0.15)",
                  }}
                >
                  🔒 <strong>Invariant:</strong> {sc.invariantVerified}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                  <button
                    onClick={() => handleRunScenario(sc.id)}
                    disabled={runningId !== null}
                    className="action-button primary"
                    style={{
                      padding: "0.35rem 0.85rem",
                      fontSize: "0.8125rem",
                      cursor: runningId !== null ? "not-allowed" : "pointer",
                      opacity: runningId !== null ? 0.6 : 1,
                    }}
                  >
                    {runningId === sc.id ? "Injecting..." : "Inject Scenario →"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Interactive Simulation Console */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#fff", margin: 0 }}>
              Live Simulation Terminal
            </h3>
            <button
              onClick={() => setExecutionLogs(["[TERMINAL_CLEARED] Sandbox terminal ready."])}
              style={{
                background: "transparent",
                border: "1px solid var(--border-color)",
                color: "var(--text-muted)",
                fontSize: "0.75rem",
                padding: "0.25rem 0.5rem",
                borderRadius: "0.25rem",
                cursor: "pointer",
              }}
            >
              Clear Terminal
            </button>
          </div>

          <div
            style={{
              background: "#090d16",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "0.5rem",
              padding: "1rem",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "0.8125rem",
              color: "#34d399",
              minHeight: "450px",
              maxHeight: "600px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
            }}
          >
            {executionLogs.map((log, idx) => (
              <div key={idx}>{log}</div>
            ))}
          </div>

          {/* Direct Links to Provenance & Verification */}
          <div
            className="glass-card"
            style={{
              marginTop: "1rem",
              padding: "1rem",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ color: "#fff", fontSize: "0.875rem", fontWeight: 600 }}>
                Verified Test Mode Transactions
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                Inspect the ~30 genuine Razorpay Test Mode transactions runbook.
              </div>
            </div>
            <Link
              href="/runbook"
              className="action-button secondary"
              style={{ padding: "0.4rem 0.85rem", fontSize: "0.8125rem", textDecoration: "none" }}
            >
              View Runbook →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
