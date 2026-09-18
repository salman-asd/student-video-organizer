import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type LearningEventName =
  | "onboarding_completed"
  | "onboarding_skipped"
  | "video_completed"
  | "goal_completed"
  | "goal_behind_pace";

export async function trackLearningEvent(
  uid: string,
  eventName: LearningEventName,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  try {
    await addDoc(collection(db, "users", uid, "learningEvents"), {
      eventName,
      metadata,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Telemetry must never block the learning action that produced it.
  }
}
