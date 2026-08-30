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
