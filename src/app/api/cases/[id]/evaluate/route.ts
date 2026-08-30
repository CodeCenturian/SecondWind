import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCasePolicyEvaluation } from "@/lib/services/orchestrator-service";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;
    const { caseRecord, decision, aiDiagnosis } = await getCasePolicyEvaluation(prisma, id);

    return NextResponse.json({
      caseId: caseRecord.id,
      caseStatus: caseRecord.status,
      caseVersion: caseRecord.version,
      decision,
      aiDiagnosis,
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
