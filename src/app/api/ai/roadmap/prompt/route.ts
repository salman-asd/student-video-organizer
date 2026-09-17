import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { buildRoadmapStepsPrompt } from "@/lib/ai/aiService";
import type { RoadmapLevel } from "@/types";

// No AI call here — this just returns the exact prompt text the generate
// route would send, so a user can copy it, run it in a different AI tool,
// and paste the reply back in via "Customize" -> paste/import.
export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const categoryName = String(body?.categoryName ?? "").trim() || "Learning topic";
  const level = body?.level as RoadmapLevel;
  const subtopics: string[] = Array.isArray(body?.subtopics) ? body.subtopics.map((s: any) => String(s).trim()).filter(Boolean) : [];

  if (!["basic", "intermediate", "advanced"].includes(level)) {
    return NextResponse.json({ error: "A valid level is required." }, { status: 400 });
  }

  const prompt = buildRoadmapStepsPrompt({ categoryName, level, subtopics });
  return NextResponse.json({ prompt }, { headers: { "Cache-Control": "private, no-store" } });
}