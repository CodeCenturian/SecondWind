import { AuditActorType } from "@prisma/client";

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
 * Normalizes parameters for immutable case audit log entries.
 */
export function formatAuditEntry(params: CreateAuditLogParams) {
  return {
    caseId: params.caseId,
    action: params.action,
    actorType: params.actorType ?? AuditActorType.SYSTEM,
    actorId: params.actorId ?? null,
    previousState: params.previousState ? JSON.parse(JSON.stringify(params.previousState)) : null,
    newState: params.newState ? JSON.parse(JSON.stringify(params.newState)) : null,
    reason: params.reason ?? null,
    metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : null,
    createdAt: new Date(),
  };
}
