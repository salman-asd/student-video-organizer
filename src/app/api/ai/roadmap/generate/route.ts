import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { adminDb } from "@/lib/server/firebase-admin";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { AiServiceError, generateRoadmapPlan } from "@/lib/ai/aiService";
import { sanitizeRoadmapSteps } from "@/lib/roadmapUtils";
import type { RoadmapLevel } from "@/types";
import admin from "firebase-admin";

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

  const categoryId = String(body?.categoryId ?? "").trim();
  const categoryName = String(body?.categoryName ?? "").trim();
  if (!categoryId && !categoryName) {
    return NextResponse.json({ error: "A categoryId or categoryName is required." }, { status: 400 });
  }

  try {
    const categorySnap = await adminDb.collection("users").doc(uid).collection("categories").get();
    const categories = categorySnap.docs.map((category) => ({
      id: category.id,
      name: String(category.data().name || ""),
    }));
    const resolvedCategory = categories.find((category) => category.id === categoryId) || categories.find((category) => category.name.trim().toLowerCase() === categoryName.toLowerCase());
    const resolvedName = resolvedCategory?.name || categoryName || "Learning topic";
    const targetCategoryId = categoryId || resolvedCategory?.id || resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "learning-topic";

    const plan = await withAiConnection(uid, async (apiKey, provider, model) => {
      return await generateRoadmapPlan({ provider, apiKey, model }, resolvedName);
    });

    const roadmapBatch = adminDb.batch();
    for (const level of ["basic", "intermediate", "advanced"] as RoadmapLevel[]) {
      roadmapBatch.set(
        adminDb.collection("roadmapTemplates").doc(`${targetCategoryId}_${level}`),
        {
          categoryId: targetCategoryId,
          level,
          steps: sanitizeRoadmapSteps(plan[level]),
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await roadmapBatch.commit();

    return NextResponse.json({
      categoryId: targetCategoryId,
      categoryName: resolvedName,
      roadmap: plan,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      console.error(`Roadmap AI error [${err.code}]: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] ?? 500 });
    }
    console.error("Failed to generate roadmap template", err);
    return NextResponse.json({ error: "Something went wrong generating a roadmap." }, { status: 500 });
  }
}
