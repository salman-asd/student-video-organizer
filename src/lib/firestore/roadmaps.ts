import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeRoadmapSteps } from "@/lib/roadmapUtils";
import type { LearningRoadmap, RoadmapLevel, RoadmapTemplate, RoadmapStep } from "@/types";

const roadmapTemplateDocId = (categoryId: string, level: RoadmapLevel) => `${categoryId}_${level}`;

export async function listRoadmapTemplates(categoryId: string): Promise<RoadmapTemplate[]> {
  const snap = await getDocs(query(collection(db, "roadmapTemplates"), where("categoryId", "==", categoryId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RoadmapTemplate));
}

export async function getRoadmapTemplate(categoryId: string, level: RoadmapLevel): Promise<RoadmapTemplate | null> {
  const snap = await getDoc(doc(db, "roadmapTemplates", roadmapTemplateDocId(categoryId, level)));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as RoadmapTemplate) : null;
}

export async function upsertRoadmapTemplate(categoryId: string, level: RoadmapLevel, steps: RoadmapStep[]) {
  const safeSteps = sanitizeRoadmapSteps(steps);
  const ref = doc(db, "roadmapTemplates", roadmapTemplateDocId(categoryId, level));
  await setDoc(ref, {
    categoryId,
    level,
    steps: safeSteps,
    generatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function saveRoadmapPlan(categoryId: string, plan: Record<RoadmapLevel, RoadmapStep[]>) {
  await Promise.all([
    upsertRoadmapTemplate(categoryId, "basic", plan.basic ?? []),
    upsertRoadmapTemplate(categoryId, "intermediate", plan.intermediate ?? []),
    upsertRoadmapTemplate(categoryId, "advanced", plan.advanced ?? []),
  ]);
}

export async function listLearningRoadmaps(uid: string): Promise<LearningRoadmap[]> {
  const snap = await getDocs(collection(db, "users", uid, "learningRoadmaps"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LearningRoadmap));
}

export async function getLearningRoadmap(uid: string, roadmapId: string): Promise<LearningRoadmap | null> {
  const snap = await getDoc(doc(db, "users", uid, "learningRoadmaps", roadmapId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as LearningRoadmap) : null;
}

export async function adoptRoadmapTemplate(uid: string, categoryId: string, level: RoadmapLevel) {
  const template = await getRoadmapTemplate(categoryId, level);
  if (!template) throw new Error("Roadmap template does not exist yet.");

  const steps = sanitizeRoadmapSteps(template.steps);
  const ref = await addDoc(collection(db, "users", uid, "learningRoadmaps"), {
    categoryId,
    level,
    steps,
    adoptedFromTemplateAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateLearningRoadmap(uid: string, roadmapId: string, steps: RoadmapStep[]) {
  await updateDoc(doc(db, "users", uid, "learningRoadmaps", roadmapId), {
    steps,
    updatedAt: serverTimestamp(),
  });
}
