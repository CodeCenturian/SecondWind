/**
 * Data Minimization and Sensitive Data Redaction Layer.
 * Ensures strict compliance:
 * Never sends credentials, raw card data, webhook signatures, or irrelevant customer PII to external AI models.
 */

// Regex patterns for sensitive data
const PAN_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;
const CVV_REGEX = /\b(?:cvv|cvc|security[ _-]?code)[\s:=]+([0-9]{3,4})\b/gi;
const EXPIRY_REGEX = /\b(?:0[1-9]|1[0-2])[\/\-](?:20)?([2-9][0-9])\b/g;
const WEBHOOK_SIGNATURE_REGEX = /\b(?:x-razorpay-signature|[a-f0-9]{64}|sha256=[a-f0-9]{64})\b/gi;
const API_KEY_SECRET_REGEX = /\b(?:rzp_(?:test|live)_[a-zA-Z0-9]+|key_secret[a-zA-Z0-9_-]*)\b/gi;
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9\-_.]+/gi;

/**
 * Redacts any card numbers, CVVs, expiry dates, API keys, signatures, and auth tokens from raw text.
 */
export function redactSensitiveText(text: string): string {
  if (!text || typeof text !== "string") return "";

  return text
    .replace(PAN_REGEX, "[REDACTED_CARD_PAN]")
    .replace(CVV_REGEX, "cvv: [REDACTED_CVV]")
    .replace(EXPIRY_REGEX, "[REDACTED_EXPIRY]")
    .replace(WEBHOOK_SIGNATURE_REGEX, "[REDACTED_SIGNATURE]")
    .replace(API_KEY_SECRET_REGEX, "[REDACTED_API_KEY]")
    .replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED_TOKEN]");
}

/**
 * Masks customer email to minimize PII exposure (e.g. j***n@example.com).
 */
export function maskEmail(email?: string | null): string | null {
  if (!email || typeof email !== "string") return null;
  const parts = email.trim().split("@");
  if (parts.length !== 2) return "[INVALID_EMAIL_REDACTED]";
  const user = parts[0];
  const domain = parts[1];
  if (!user || !domain) return "[INVALID_EMAIL_REDACTED]";

  if (user.length <= 2) {
    return `${user[0]}*@${domain}`;
  }
  return `${user[0]}${"*".repeat(user.length - 2)}${user[user.length - 1]}@${domain}`;
}

/**
 * Masks customer phone number (e.g. +91 ******7890).
 */
export function maskPhone(phone?: string | null): string | null {
  if (!phone || typeof phone !== "string") return null;
  const cleaned = phone.trim();
  if (cleaned.length <= 4) return "[REDACTED_PHONE]";
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-4);
  return `${start}${"*".repeat(Math.max(0, cleaned.length - 7))}${end}`;
}

export interface RawDiagnosisInput {
  failureCode?: string | null;
  failureReason?: string | null;
  currency?: string | null;
  attemptCount: number;
  errorCategory?: string | null;
  errorSource?: string | null;
  errorStep?: string | null;
  rawPayloadSnippet?: unknown;
}

export interface SanitizedDiagnosisInput {
  failureCode: string;
  failureReason: string;
  currency: string;
  pastAttemptCount: number;
  errorCategory?: string;
  errorSource?: string;
  errorStep?: string;
}

/**
 * Strictly sanitizes and minimizes input payload.
 * Keeps only non-PII diagnostic metadata, stripping all payment IDs, customer identifiers, and secrets.
 */
export function sanitizeDiagnosisInput(raw: RawDiagnosisInput): SanitizedDiagnosisInput {
  const failureCode = raw.failureCode
    ? redactSensitiveText(raw.failureCode).trim()
    : "UNKNOWN_ERROR_CODE";

  const failureReason = raw.failureReason
    ? redactSensitiveText(raw.failureReason).trim()
    : "No failure description provided";

  const currency = raw.currency ? raw.currency.toUpperCase() : "INR";
  const pastAttemptCount = Math.max(0, Number(raw.attemptCount) || 0);

  const result: SanitizedDiagnosisInput = {
    failureCode,
    failureReason,
    currency,
    pastAttemptCount,
  };

  if (raw.errorCategory && typeof raw.errorCategory === "string") {
    result.errorCategory = redactSensitiveText(raw.errorCategory);
  }
  if (raw.errorSource && typeof raw.errorSource === "string") {
    result.errorSource = redactSensitiveText(raw.errorSource);
  }
  if (raw.errorStep && typeof raw.errorStep === "string") {
    result.errorStep = redactSensitiveText(raw.errorStep);
  }

  return result;
}
