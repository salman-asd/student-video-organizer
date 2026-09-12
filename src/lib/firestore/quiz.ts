import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { QuizQuestion, VideoQuizCache } from "@/types";

export function buildVideoSourceHash(title: string, description?: string | null, summary?: string | null): string {
  const text = `${(title || "").trim()}\n${(description || "").trim()}\n${(summary || "").trim()}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export async function getVideoQuiz(videoId: string, playlistId?: string): Promise<VideoQuizCache | null> {
  const ref = playlistId
    ? doc(db, "playlists", playlistId, "videos", videoId, "quiz")
    : doc(db, "playlists", "shared", "videos", videoId, "quiz");
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as VideoQuizCache) : null;
}

export async function saveVideoQuiz(
  videoId: string,
  questions: QuizQuestion[],
  sourceHash: string,
  playlistId?: string,
) {
  const ref = playlistId
    ? doc(db, "playlists", playlistId, "videos", videoId, "quiz")
    : doc(db, "playlists", "shared", "videos", videoId, "quiz");

  await setDoc(ref, {
    questions,
    generatedAt: serverTimestamp(),
    sourceHash,
  }, { merge: true });
}

export async function getPersonalVideoQuiz(ownerId: string, playlistId: string, videoId: string): Promise<VideoQuizCache | null> {
  const snap = await getDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId, "quiz"));
  return snap.exists() ? (snap.data() as VideoQuizCache) : null;
}

export async function savePersonalVideoQuiz(
  ownerId: string,
  playlistId: string,
  videoId: string,
  questions: QuizQuestion[],
  sourceHash: string,
) {
  await setDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId, "quiz"), {
    questions,
    generatedAt: serverTimestamp(),
    sourceHash,
  }, { merge: true });
}
