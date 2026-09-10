import { adminDb } from "@/lib/server/firebase-admin";

export interface AiPreferences {
  speechToTextEnabled: boolean;
}

const defaults: AiPreferences = { speechToTextEnabled: false };

export async function getAiPreferences(uid: string): Promise<AiPreferences> {
  const snap = await adminDb.collection("users").doc(uid).get();
  const settings = snap.data()?.aiSettings;
  return { speechToTextEnabled: settings?.speechToTextEnabled === true };
}

export async function updateAiPreferences(uid: string, input: Partial<AiPreferences>): Promise<AiPreferences> {
  const current = await getAiPreferences(uid);
  const next = { ...defaults, ...current, ...input };
  await adminDb.collection("users").doc(uid).set({ aiSettings: next }, { merge: true });
  return next;
}
