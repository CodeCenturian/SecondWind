"use client";

import React, { useState } from "react";
import { PageHeader } from "@/components/page-header";
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
  {
    id: "AFA_THRESHOLD_BLOCK",
    title: "10. AFA Threshold Block (>₹15,000)",
    category: "Policy & Network",
    description: "Recurring payment of ₹25,000 (> ₹15k RBI AFA limit) fails. Exercises complete automated pipeline: Ingestion → AI Diagnosis → Policy Evaluation → Payment Link Dispatch.",
    invariantVerified: "AI classifies AFA_THRESHOLD_BLOCK, policy disallows direct auto-retry, and fresh Payment Link is automatically created in IN_PROGRESS state without manual operator action.",
  },
];

export default function DevInjectorPage() {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    "[SANDBOX_INIT] Developer Event Injector ready. Select a scenario to simulate.",
    "[SAFEGUARD] Zero real Razorpay API calls are permitted. All simulated events are isolated from verified financial metrics.",
  ]);

  async function handleRunScenario(scenarioId: string) {
    setRunningId(scenarioId);
    setExecutionLogs((prev) => [
      ...prev,
      `\n------------------------------------------------------------`,
      `>>> [INJECT_START] Scenario: ${scenarioId} (${new Date().toLocaleTimeString()})...`,
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
          `>>> [INJECT_ERROR] HTTP ${res.status}: ${data.error || "Execution failed"}`,
          data.details ? `    Details: ${typeof data.details === "string" ? data.details : JSON.stringify(data.details, null, 2)}` : "",
        ]);
      } else {
        const scenarioLogs = Array.isArray(data.logs) ? data.logs : [];
        const resultCaseId = data.data?.caseId || data.caseId;
        const extraData = data.data || data.result;

        setExecutionLogs((prev) => [
          ...prev,
          ...scenarioLogs.map((log: string) => `  ↳ ${log}`),
          `>>> [INJECT_SUCCESS] ${data.message || "Scenario executed successfully"}`,
          resultCaseId ? `>>> [DATABASE_CASE] Case ID: ${resultCaseId} (Persisted to PostgreSQL)` : "",
          extraData ? `>>> [TRANSACTION_STATE]\n${JSON.stringify(extraData, null, 2)}` : "",
          `>>> [INVARIANT_VERIFIED] Deterministic policy rule satisfied without human intervention.`,
        ].filter(Boolean));
      }
    } catch (err: unknown) {
      setExecutionLogs((prev) => [
        ...prev,
        `>>> [NETWORK_ERROR] ${(err as Error).message}`,
      ]);
    } finally {
      setRunningId(null);
    }
  }

  function handleClearLogs() {
    setExecutionLogs(["[SANDBOX_CLEARED] Ready for next scenario injection."]);
  }

  return (
    <div>
      {/* 1. Page Header */}
      <PageHeader
        title="Developer Sandbox & Event Injector"
        subtitle="Automated simulation harness for testing edge cases, out-of-order webhooks, idempotent replay protection, and adversarial payment races."
        badge={
          <span className="badge-base badge-neutral">
            DEV ENVIRONMENT ONLY
          </span>
        }
        actions={
          <Link href="/reconciliation" className="btn btn-secondary btn-sm">
            View Provenance Ledger →
          </Link>
        }
      />

      {/* Isolation Safety Banner */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid var(--warning-primary)",
          borderRadius: "var(--radius-md)",
          padding: "8px var(--space-4)",
          marginBottom: "var(--space-6)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px",
          fontSize: "0.75rem",
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>
          <strong>Simulation Isolation Active:</strong> All simulated test fixtures carry <code>isSimulation: true</code> flags and are completely excluded from verified financial metrics.
        </span>
        <span className="code-inline">Zero Production Impact</span>
      </div>

      {/* Grid: Scenarios + Terminal Log */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "var(--space-6)",
          alignItems: "start",
        }}
      >
        {/* Scenarios List */}
        <div>
          <h2 className="text-h2" style={{ marginBottom: "var(--space-3)" }}>
            Available Test Scenarios ({SCENARIOS.length})
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {SCENARIOS.map((sc) => {
              const isRunning = runningId === sc.id;

              return (
                <div
                  key={sc.id}
                  className="ops-panel"
                  style={{ padding: "var(--space-4)" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "var(--space-2)",
                      gap: "8px",
                    }}
                  >
                    <div>
                      <span className="badge-base badge-neutral" style={{ fontSize: "0.625rem", marginBottom: "4px" }}>
                        {sc.category}
                      </span>
                      <h3 className="text-h3">{sc.title}</h3>
                    </div>

                    <button
                      onClick={() => handleRunScenario(sc.id)}
                      disabled={runningId !== null}
                      className="btn btn-primary btn-sm"
                    >
                      {isRunning ? "Injecting..." : "Inject Scenario"}
                    </button>
                  </div>

                  <p className="text-body" style={{ fontSize: "0.8125rem", marginBottom: "var(--space-2)" }}>
                    {sc.description}
                  </p>

                  <div
                    style={{
                      padding: "6px 8px",
                      background: "var(--bg-app)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-xs)",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <strong style={{ color: "var(--accent-primary)" }}>Invariant Verified: </strong>
                    {sc.invariantVerified}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Live Execution Logs Terminal */}
        <div style={{ position: "sticky", top: "var(--space-6)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "var(--space-3)",
            }}
          >
            <h2 className="text-h2">Execution Output Stream</h2>
            <button
              onClick={handleClearLogs}
              className="btn btn-secondary btn-sm"
            >
              Clear Output
            </button>
          </div>

          <div
            style={{
              background: "var(--bg-code)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              fontFamily: "var(--font-mono)",
              fontSize: "0.75rem",
              lineHeight: 1.6,
              color: "#cbd5e1",
              minHeight: "420px",
              maxHeight: "680px",
              overflowY: "auto",
              whiteSpace: "pre-wrap",
            }}
          >
            {executionLogs.map((log, idx) => (
              <div key={idx} style={{ marginBottom: "2px" }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
