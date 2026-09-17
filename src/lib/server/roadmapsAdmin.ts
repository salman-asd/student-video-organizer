import admin from "firebase-admin";
import { adminDb } from "@/lib/server/firebase-admin";
import { sanitizeRoadmapSteps } from "@/lib/roadmapUtils";
import type { RoadmapLevel, RoadmapTemplate, LearningRoadmap } from "@/types";

const roadmapTemplateDocId = (categoryId: string, level: RoadmapLevel) => `${categoryId}_${level}`;

// Admin-SDK equivalents of lib/firestore/roadmaps.ts, for use ONLY from
// server routes. The client-SDK versions authenticate as whatever user is
// signed in in the browser; on the server there is no such session, so
// calling them from an API route always hits Firestore unauthenticated and
// gets rejected by security rules ("permission-denied"). These bypass
// rules the same way /api/ai/roadmap/generate already does.

export async function getRoadmapTemplateAdmin(categoryId: string, level: RoadmapLevel): Promise<RoadmapTemplate | null> {
  const snap = await adminDb.collection("roadmapTemplates").doc(roadmapTemplateDocId(categoryId, level)).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as RoadmapTemplate) : null;
}

export async function listLearningRoadmapsAdmin(uid: string): Promise<LearningRoadmap[]> {
  const snap = await adminDb.collection("users").doc(uid).collection("learningRoadmaps").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LearningRoadmap));
}

export async function adoptRoadmapTemplateAdmin(uid: string, categoryId: string, level: RoadmapLevel): Promise<string> {
  const template = await getRoadmapTemplateAdmin(categoryId, level);
  if (!template) throw new Error("Roadmap template does not exist yet.");

  const steps = sanitizeRoadmapSteps(template.steps);
  const ref = await adminDb.collection("users").doc(uid).collection("learningRoadmaps").add({
    categoryId,
    level,
    steps,
    source: "template",
    adoptedFromTemplateAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return ref.id;
}