/**
 * Typed domain errors for SECONDWIND application.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string = "INTERNAL_ERROR", statusCode: number = 500, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConcurrencyConflictError extends AppError {
  constructor(caseId: string, expectedVersion: number, actualVersion: number) {
    super(
      `Optimistic lock conflict on RecoveryCase ${caseId}: expected version ${expectedVersion}, but found version ${actualVersion}. State has been modified concurrently.`,
      "CONCURRENCY_CONFLICT",
      409,
      { caseId, expectedVersion, actualVersion }
    );
  }
}

export class WebhookSignatureError extends AppError {
  constructor(reason: string = "Invalid HMAC-SHA256 signature") {
    super(`Webhook signature validation failed: ${reason}`, "INVALID_WEBHOOK_SIGNATURE", 401);
  }
}

export class DuplicateEventError extends AppError {
  constructor(eventId: string) {
    super(`Webhook event ${eventId} has already been recorded and processed.`, "DUPLICATE_EVENT", 200, { eventId });
  }
}

export class PolicyViolationError extends AppError {
  constructor(policyReason: string, details?: Record<string, unknown>) {
    super(`Recovery action rejected by merchant policy: ${policyReason}`, "POLICY_VIOLATION", 422, details);
  }
}

export class EntityNotFoundError extends AppError {
  constructor(entityName: string, id: string) {
    super(`${entityName} with identifier "${id}" was not found.`, "NOT_FOUND", 404, { entityName, id });
  }
}
