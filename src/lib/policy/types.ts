import { CaseStatus, AttemptChannel } from "@prisma/client";

export type PolicyOutcome = "ALLOW_ACTION" | "STOP" | "MANUAL_REVIEW";

export interface MerchantPolicyRules {
  policyId: string;
  policyVersion: number;
  isActive: boolean;
  maxAttempts: number;
  coolingPeriodMinutes: number;
  linkExpiryMinutes: number;
  minAmountMinor?: bigint;
  maxAmountMinor?: bigint;
  supportedCurrencies: string[];
  allowedChannels: AttemptChannel[];
  autoRefundEnabled: boolean;
}

export interface PastAttemptSummary {
  attemptNumber: number;
  channel: AttemptChannel;
  status: string;
  createdAt: Date;
}

export interface FailureDiagnosis {
  category: string; // e.g. "INSUFFICIENT_FUNDS", "TEMPORARY_NETWORK_ERROR", "AUTHENTICATION_FAILED", "SUSPECTED_FRAUD"
  confidence: number; // 0.0 to 1.0
  isRecoverable: boolean;
  explanation?: string;
}

export interface PolicyEvaluationInput {
  caseId: string;
  caseStatus: CaseStatus;
  caseVersion: number;
  amountMinor: bigint;
  currency: string;
  merchantPolicy: MerchantPolicyRules;
  pastAttempts: PastAttemptSummary[];
  currentTime: Date;
  isDoNotContact: boolean;
  diagnosis?: FailureDiagnosis | null;
  duplicateRiskDetected: boolean;
  hasCustomerContact: boolean;
  hasOrderOrPaymentRef: boolean;
  expectedPolicyVersion?: number;
}

export interface PolicyDecision {
  outcome: PolicyOutcome;
  reasons: string[];
  allowedActionTypes: AttemptChannel[];
  remainingAttempts: number;
  nextStoppingRule: string;
  policyVersion: string;
  evaluatedAt: Date;
  canExecute: boolean;
}
