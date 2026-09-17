import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { adminDb } from "@/lib/server/firebase-admin";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { AiServiceError, generateRoadmapStepsForLevel } from "@/lib/ai/aiService";
import { sanitizeRoadmapSteps } from "@/lib/roadmapUtils";
import type { RoadmapLevel } from "@/types";
import admin from "firebase-admin";

const STATUS_BY_CODE: Record<string, number> = {
  auth: 400, rate_limit: 429, invalid_request: 502, blocked: 422,
  timeout: 504, network: 502, server_error: 502, unsupported_provider: 400, unknown: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const categoryId = String(body?.categoryId ?? "").trim();
  const categoryName = String(body?.categoryName ?? "").trim();
  const level = body?.level as RoadmapLevel;
  const subtopics: string[] = Array.isArray(body?.subtopics) ? body.subtopics.map((s: any) => String(s).trim()).filter(Boolean) : [];
  const roadmapId = String(body?.roadmapId ?? "").trim() || null;

  if (!categoryId && !categoryName) return NextResponse.json({ error: "A categoryId or categoryName is required." }, { status: 400 });
  if (!["basic", "intermediate", "advanced"].includes(level)) return NextResponse.json({ error: "A valid level is required." }, { status: 400 });

  try {
    const categorySnap = await adminDb.collection("users").doc(uid).collection("categories").get();
    const categories = categorySnap.docs.map((c) => ({ id: c.id, name: String(c.data().name || "") }));
    const resolvedCategory = categories.find((c) => c.id === categoryId) || categories.find((c) => c.name.trim().toLowerCase() === categoryName.toLowerCase());
    const resolvedName = resolvedCategory?.name || categoryName || "Learning topic";
    const targetCategoryId = categoryId || resolvedCategory?.id || resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learning-topic";

    const steps = sanitizeRoadmapSteps(
      await withAiConnection(uid, (apiKey, provider, model) =>
        generateRoadmapStepsForLevel({ provider, apiKey, model }, { categoryName: resolvedName, level, subtopics })
      )
    );

    const roadmapsRef = adminDb.collection("users").doc(uid).collection("learningRoadmaps");

    // Every category+level has exactly one roadmap per user — this route
    // upserts it, whether the caller is "Generate" (no roadmap yet),
    // "Regenerate" (roadmapId supplied), or a level that already has a
    // roadmap but no roadmapId was passed (fall back to finding it by
    // categoryId+level so we never create a second doc for the same slot).
    let targetRef = roadmapId ? roadmapsRef.doc(roadmapId) : null;

    if (targetRef) {
      const snap = await targetRef.get();
      const data = snap.data() as { categoryId?: string; level?: RoadmapLevel } | undefined;
      if (!snap.exists || data?.categoryId !== targetCategoryId || data?.level !== level) {
        return NextResponse.json({ error: "This roadmap could not be found for regeneration." }, { status: 404 });
      }
    } else {
      const existingSnap = await roadmapsRef.where("categoryId", "==", targetCategoryId).where("level", "==", level).limit(1).get();
      if (!existingSnap.empty) targetRef = existingSnap.docs[0].ref;
    }

    let finalRoadmapId: string;
    if (targetRef) {
      await targetRef.update({
        steps,
        source: "generated",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      finalRoadmapId = targetRef.id;
    } else {
      const created = await roadmapsRef.add({
        categoryId: targetCategoryId,
        level,
        steps,
        source: "generated",
        adoptedFromTemplateAt: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      finalRoadmapId = created.id;
    }

    return NextResponse.json(
      { categoryId: targetCategoryId, categoryName: resolvedName, level, steps, roadmapId: finalRoadmapId },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      console.error(`Roadmap AI error [${err.code}]: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 500 });
    }
    console.error("Failed to generate roadmap", err);
    return NextResponse.json({ error: "Something went wrong generating a roadmap." }, { status: 500 });
  }
}