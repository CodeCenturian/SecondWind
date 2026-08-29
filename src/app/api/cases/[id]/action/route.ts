import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { executeRecoveryAction } from "@/lib/services/orchestrator-service";
import { AttemptChannel, AuditActorType } from "@prisma/client";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ActionRequestSchema = z.object({
  actionType: z.nativeEnum(AttemptChannel).default(AttemptChannel.PAYMENT_LINK),
  idempotencyKey: z.string().min(1, "idempotencyKey is required"),
  expectedVersion: z.number().int().positive("expectedVersion must be positive integer"),
  actorId: z.string().optional(),
});

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;
    const body = await req.json();

    const parseResult = ActionRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid action request payload",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { actionType, idempotencyKey, expectedVersion, actorId } = parseResult.data;

    const result = await executeRecoveryAction(prisma, {
      caseId: id,
      requestedChannel: actionType,
      idempotencyKey,
      expectedVersion,
      actorId: actorId ?? "operator_session",
      actorType: AuditActorType.OPERATOR,
    });

    return NextResponse.json(
      {
        success: true,
        isDuplicateRequest: result.isDuplicateRequest,
        decision: result.decision,
        attempt: {
          id: result.attempt.id,
          attemptNumber: result.attempt.attemptNumber,
          channel: result.attempt.channel,
          status: result.attempt.status,
          paymentLinkId: result.attempt.paymentLinkId,
          paymentLinkUrl: result.attempt.paymentLinkUrl,
          createdAt: result.attempt.createdAt,
        },
        updatedCase: {
          id: result.updatedCase.id,
          status: result.updatedCase.status,
          version: result.updatedCase.version,
          lastAttemptAt: result.updatedCase.lastAttemptAt,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.statusCode }
      );
    }

    const message = error instanceof Error ? error.message : "Internal orchestrator error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
