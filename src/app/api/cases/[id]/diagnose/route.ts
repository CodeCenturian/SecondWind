import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { diagnosePaymentFailureWithGemini } from "@/lib/ai/diagnosis";
import { getCasePolicyEvaluation } from "@/lib/services/orchestrator-service";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteProps) {
  try {
    const { id } = await params;

    const currentCase = await prisma.recoveryCase.findUnique({
      where: { id },
      include: {
        attempts: true,
      },
    });

    if (!currentCase) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    // Call Gemini Flash server diagnostic service with sanitized data
    const diagnosisResult = await diagnosePaymentFailureWithGemini(prisma, {
      caseId: currentCase.id,
      rawInput: {
        failureCode: currentCase.failureCode,
        failureReason: currentCase.failureReason,
        currency: currentCase.currency,
        attemptCount: currentCase.attempts.length,
      },
      actorId: "operator_manual_trigger",
    });

    // Re-evaluate policy incorporating the newly produced AI diagnosis
    const { decision } = await getCasePolicyEvaluation(
      prisma,
      id,
      diagnosisResult.diagnosis
    );

    return NextResponse.json({
      success: true,
      isFallback: diagnosisResult.isFallback,
      error: diagnosisResult.error,
      diagnosis: diagnosisResult.diagnosis,
      decision,
    });
  } catch (error: unknown) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.statusCode }
      );
    }

    const message = error instanceof Error ? error.message : "Internal diagnosis error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
