import React from "react";
import { CaseStatus } from "@prisma/client";
import { Check, Zap, Activity, Settings, AlertTriangle, X } from "lucide-react";

interface CaseStateBadgeProps {
  status: CaseStatus | string;
}

export function CaseStateBadge({ status }: CaseStateBadgeProps) {
  switch (status) {
    case CaseStatus.RECOVERED:
    case "RECOVERED":
      return (
        <span className="badge-base badge-recovered">
          <Check size={11} /> RECOVERED
        </span>
      );
    case CaseStatus.IN_PROGRESS:
    case "IN_PROGRESS":
      return (
        <span className="badge-base badge-accent">
          <Zap size={11} /> IN PROGRESS
        </span>
      );
    case CaseStatus.MANUAL_REVIEW:
    case "MANUAL_REVIEW":
      return (
        <span className="badge-base badge-warning">
          <AlertTriangle size={11} /> MANUAL REVIEW
        </span>
      );
    case CaseStatus.DETECTED:
    case "DETECTED":
      return (
        <span className="badge-base badge-neutral">
          <Activity size={11} /> DETECTED
        </span>
      );
    case CaseStatus.CLOSED:
    case "CLOSED":
      return (
        <span className="badge-base badge-neutral">
          <X size={11} /> CLOSED
        </span>
      );
    case "FAILED":
      return (
        <span className="badge-base badge-danger">
          <X size={11} /> FAILED
        </span>
      );
    default:
      return (
        <span className="badge-base badge-neutral">
          {status}
        </span>
      );
  }
}

interface EvidenceSourceBadgeProps {
  scope: "FINANCIAL_SCOPE" | "OPERATIONAL_ONLY" | "DEV_SANDBOX" | "SETTLED_REFUNDS";
  label?: string;
}

export function EvidenceSourceBadge({ scope, label }: EvidenceSourceBadgeProps) {
  switch (scope) {
    case "FINANCIAL_SCOPE":
      return (
        <span className="badge-base badge-recovered" title="Counted in authoritative financial ledger based strictly on verified payment.captured webhook">
          <Check size={11} /> {label || "FINANCIAL SCOPE"}
        </span>
      );
    case "OPERATIONAL_ONLY":
      return (
        <span className="badge-base badge-accent" title="Operational tracking metric. Not recognized as settled financial revenue.">
          <Zap size={11} /> {label || "OPERATIONAL"}
        </span>
      );
    case "DEV_SANDBOX":
      return (
        <span className="badge-base badge-neutral" title="Simulated developer sandbox fixture. Completely isolated from financial metrics.">
          <Settings size={11} /> {label || "DEV SANDBOX"}
        </span>
      );
    case "SETTLED_REFUNDS":
      return (
        <span className="badge-base badge-recovered" title="Authoritatively processed and settled refund confirmed by Razorpay.">
          <Check size={11} /> {label || "SETTLED REFUND"}
        </span>
      );
    default:
      return null;
  }
}

interface PolicyReasonBadgeProps {
  reason: string;
}

export function PolicyReasonBadge({ reason }: PolicyReasonBadgeProps) {
  if (reason === "COMPLIANCE_BLOCK_AFA_THRESHOLD_BLOCK") {
    return (
      <span className="badge-base badge-warning" title="RBI e-mandate limit requires customer Additional Factor of Authentication (AFA)">
        <AlertTriangle size={11} /> RBI AFA Block (&gt;₹15k)
      </span>
    );
  }

  if (reason === "COMPLIANCE_BLOCK_MANDATE_EXPIRED_OR_MISSING") {
    return (
      <span className="badge-base badge-warning" title="e-mandate registration expired or missing; auto-retry disallowed">
        <AlertTriangle size={11} /> Mandate Expired / Missing
      </span>
    );
  }

  if (reason === "RETRY_DISALLOWED_FRESH_AUTH_REQUIRED") {
    return (
      <span className="badge-base badge-danger" title="Direct automated retry prohibited; customer must authenticate fresh link">
        <X size={11} /> Auto-Retry Disallowed (Fresh Auth Required)
      </span>
    );
  }

  if (reason === "POLICY_RULES_SATISFIED") {
    return (
      <span className="badge-base badge-recovered" title="All deterministic merchant stopping rules passed">
        <Check size={11} /> Policy Rules Satisfied
      </span>
    );
  }

  if (reason === "CUSTOMER_DO_NOT_CONTACT") {
    return (
      <span className="badge-base badge-danger" title="Customer has opted out of automated recovery messages">
        <X size={11} /> Customer Do-Not-Contact
      </span>
    );
  }

  if (reason === "MAX_ATTEMPTS_EXCEEDED") {
    return (
      <span className="badge-base badge-danger" title="Maximum recovery attempts cap reached">
        <X size={11} /> Max Attempts Cap
      </span>
    );
  }

  if (reason === "COOLDOWN_PERIOD_ACTIVE") {
    return (
      <span className="badge-base badge-neutral" title="Cooling-off period active between recovery attempts">
        <Activity size={11} /> Cooldown Active
      </span>
    );
  }

  return (
    <span className="badge-base badge-neutral">
      {reason.replace(/_/g, " ")}
    </span>
  );
}

interface AuditActionBadgeProps {
  action: string;
}

export function AuditActionBadge({ action }: AuditActionBadgeProps) {
  switch (action) {
    case "AUTO_PIPELINE_TRIGGERED":
      return (
        <span className="badge-base badge-accent" title="End-to-end automatic recovery pipeline triggered synchronously upon failure webhook">
          <Zap size={11} /> Auto Pipeline Triggered
        </span>
      );
    case "AUTO_PIPELINE_STOPPED_AT_POLICY":
      return (
        <span className="badge-base badge-warning" title="Auto pipeline halted cleanly by merchant policy rules">
          <AlertTriangle size={11} /> Auto Pipeline Stopped at Policy
        </span>
      );
    case "AUTO_PIPELINE_ERROR":
      return (
        <span className="badge-base badge-danger" title="Auto pipeline encountered an execution error">
          <X size={11} /> Auto Pipeline Error
        </span>
      );
    case "AI_DIAGNOSIS_COMPLETED":
      return (
        <span className="badge-base badge-neutral">
          <Activity size={11} /> AI Diagnosis Completed
        </span>
      );
    case "AI_DIAGNOSIS_FAILED":
      return (
        <span className="badge-base badge-danger">
          <X size={11} /> AI Diagnosis Failed
        </span>
      );
    case "RECOVERY_ACTION_EXECUTED":
    case "PAYMENT_LINK_CREATED":
      return (
        <span className="badge-base badge-recovered">
          <Check size={11} /> Recovery Action Dispatched
        </span>
      );
    case "PAYMENT_CAPTURED_RECONCILED":
      return (
        <span className="badge-base badge-recovered">
          <Check size={11} /> Payment Captured & Reconciled
        </span>
      );
    default:
      return (
        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.8125rem" }}>
          {action}
        </span>
      );
  }
}
