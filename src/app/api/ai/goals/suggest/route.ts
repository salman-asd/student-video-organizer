import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { AiServiceError, generateGoalSuggestions } from "@/lib/ai/aiService";
import type { RoadmapStep } from "@/types";

const STATUS_BY_CODE: Record<string, number> = {
  auth: 400,
  rate_limit: 429,
  invalid_request: 502,
  blocked: 422,
  timeout: 504,
  network: 502,
  server_error: 502,
  unsupported_provider: 400,
  unknown: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const categoryName = String(body?.categoryName ?? "").trim();
  const level = String(body?.level ?? "").trim() || "basic";
  const rawSteps = Array.isArray(body?.steps) ? (body.steps as unknown[]) : [];
  const steps = rawSteps
    .map((step) => step as Partial<RoadmapStep>)
    .filter((step): step is Partial<RoadmapStep> => !!step && typeof step.title === "string" && step.title.trim().length > 0)
    .map((step) => ({ title: step.title!.trim(), description: (step.description || "").trim() }));

  if (!categoryName) {
    return NextResponse.json({ error: "A categoryName is required." }, { status: 400 });
  }
  if (steps.length === 0) {
    return NextResponse.json({ error: "At least one roadmap step is required." }, { status: 400 });
  }

  try {
    const suggestions = await withAiConnection(uid, async (apiKey, provider, model) => {
      return await generateGoalSuggestions({ provider, apiKey, model }, { categoryName, level, steps });
    });

    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 500 });
    }
    console.error("Failed to generate goal suggestions", err);
    return NextResponse.json({ error: "Something went wrong suggesting goals." }, { status: 500 });
  }
}
