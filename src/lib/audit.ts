import { AuditActorType, Prisma } from "@prisma/client";

export interface CreateAuditLogParams {
  caseId: string;
  action: string;
  actorType?: AuditActorType;
  actorId?: string | null;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Safely serializes arbitrary objects for Prisma InputJsonValue fields,
 * automatically converting BigInt values to string representation.
 */
export function safeJson(data: unknown): Prisma.InputJsonValue {
  if (data === undefined || data === null) return null as unknown as Prisma.InputJsonValue;
  return JSON.parse(
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  ) as Prisma.InputJsonValue;
}

/**
 * Normalizes parameters for immutable case audit log entries.
 */
export function formatAuditEntry(params: CreateAuditLogParams) {
  return {
    caseId: params.caseId,
    action: params.action,
    actorType: params.actorType ?? AuditActorType.SYSTEM,
    actorId: params.actorId ?? null,
    previousState: params.previousState ? safeJson(params.previousState) : undefined,
    newState: params.newState ? safeJson(params.newState) : undefined,
    reason: params.reason ?? null,
    metadata: params.metadata ? safeJson(params.metadata) : undefined,
    createdAt: new Date(),
  };
}
