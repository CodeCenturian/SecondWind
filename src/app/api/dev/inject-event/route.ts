import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { InjectedScenarioType, runInjectedScenario, ProductionEnvironmentError } from "@/lib/services/injector-service";

export async function POST(req: NextRequest) {
  // 1. Environment Safeguard
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "Forbidden: Developer Event Injector is strictly disabled in production environments.",
      },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const scenario = body.scenario as InjectedScenarioType;

    if (!scenario) {
      return NextResponse.json(
        { error: "Missing required 'scenario' field in request body." },
        { status: 400 }
      );
    }

    const result = await runInjectedScenario(prisma, scenario);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ProductionEnvironmentError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    console.error("[INJECTOR_ERROR]", error);
    return NextResponse.json(
      {
        error: "Failed to execute simulation scenario.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
