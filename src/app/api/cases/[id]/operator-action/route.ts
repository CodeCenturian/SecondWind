import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CaseStatus, AuditActorType } from "@prisma/client";

interface OperatorActionBody {
  action: "ESCALATE_TO_MANUAL_REVIEW" | "CLOSE_CASE" | "REOPEN_FOR_RECOVERY";
  reason: string;
  expectedVersion: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as OperatorActionBody;

    if (!body.action || !body.reason || body.expectedVersion === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: action, reason, and expectedVersion." },
        { status: 400 }
      );
    }

    const currentCase = await prisma.recoveryCase.findUnique({
      where: { id },
    });

    if (!currentCase) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }

    // Optimistic Concurrency Lock
    if (currentCase.version !== body.expectedVersion) {
      return NextResponse.json(
        {
          error: `Concurrency Conflict: Expected version ${body.expectedVersion}, but case is currently at version ${currentCase.version}. Please refresh.`,
        },
        { status: 409 }
      );
    }

    let targetStatus: CaseStatus;
    switch (body.action) {
      case "ESCALATE_TO_MANUAL_REVIEW":
        targetStatus = CaseStatus.MANUAL_REVIEW;
        break;
      case "CLOSE_CASE":
        targetStatus = CaseStatus.CLOSED;
        break;
      case "REOPEN_FOR_RECOVERY":
        targetStatus = CaseStatus.IN_PROGRESS;
        break;
      default:
        return NextResponse.json({ error: "Invalid operator action." }, { status: 400 });
    }

    // Atomic update and audit log in a single transaction
    const updatedCase = await prisma.$transaction(async (tx) => {
      const c = await tx.recoveryCase.update({
        where: { id },
        data: {
          status: targetStatus,
          version: currentCase.version + 1,
        },
      });

      await tx.caseAuditLog.create({
        data: {
          caseId: id,
          action: `OPERATOR_${body.action}`,
          actorType: AuditActorType.OPERATOR,
          previousState: JSON.parse(JSON.stringify({ status: currentCase.status, version: currentCase.version })),
          newState: JSON.parse(JSON.stringify({ status: c.status, version: c.version })),
          reason: body.reason,
          metadata: JSON.parse(JSON.stringify({ requestedAction: body.action })),
        },
      });

      return c;
    });

    return NextResponse.json({ success: true, case: updatedCase }, { status: 200 });
  } catch (error) {
    console.error("[OPERATOR_ACTION_ERROR]", error);
    return NextResponse.json(
      {
        error: "Failed to perform operator action.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
