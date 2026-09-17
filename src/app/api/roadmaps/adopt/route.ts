import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { adoptRoadmapTemplateAdmin, getRoadmapTemplateAdmin, listLearningRoadmapsAdmin } from "@/lib/server/roadmapsAdmin";
import { adminDb } from "@/lib/server/firebase-admin";
import type { RoadmapLevel } from "@/types";
import { normalizeUserInterests } from "@/lib/userInterests";

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
  const level = String(body?.level ?? "").trim() as RoadmapLevel;
  if (!categoryId || !["basic", "intermediate", "advanced"].includes(level)) {
    return NextResponse.json({ error: "A valid categoryId and level are required." }, { status: 400 });
  }

  try {
    const template = await getRoadmapTemplateAdmin(categoryId, level);
    if (!template) {
      return NextResponse.json({ error: "This roadmap template has not been generated yet." }, { status: 404 });
    }

    const existing = await listLearningRoadmapsAdmin(uid);
    const current = existing.find((roadmap) => roadmap.categoryId === categoryId && roadmap.level === level);

    const roadmapId = current ? current.id : await adoptRoadmapTemplateAdmin(uid, categoryId, level);

    const profileSnap = await adminDb.collection("users").doc(uid).get();
    const profileData = profileSnap.data() as any;
    const nextInterests = normalizeUserInterests((profileData?.interests ?? []).map((item: any) => ({
      categoryId: item?.categoryId,
      level: item?.categoryId === categoryId ? level : item?.level ?? null,
      subtopics: item?.subtopics,
    })));
    await adminDb.collection("users").doc(uid).set({ interests: nextInterests }, { merge: true });

    return NextResponse.json({ roadmapId, adopted: !current });
  } catch (err: any) {
    console.error("Failed to adopt roadmap", err);
    return NextResponse.json({ error: "Unable to adopt this roadmap." }, { status: 500 });
  }
}