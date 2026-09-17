import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { QuizQuestion, VideoQuizCache } from "@/types";
export { buildVideoSourceHash } from "@/lib/quizSource";

export async function getVideoQuiz(videoId: string, playlistId?: string): Promise<VideoQuizCache | null> {
  const ref = playlistId
    ? doc(db, "playlists", playlistId, "videos", videoId, "quiz", "data")
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
    ? doc(db, "playlists", playlistId, "videos", videoId, "quiz", "data")
    : doc(db, "playlists", "shared", "videos", videoId, "quiz");

  await setDoc(ref, {
    questions,
    generatedAt: serverTimestamp(),
    sourceHash,
  }, { merge: true });
}

export async function getPersonalVideoQuiz(ownerId: string, playlistId: string, videoId: string): Promise<VideoQuizCache | null> {
  const snap = await getDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId, "quiz", "data"));
  return snap.exists() ? (snap.data() as VideoQuizCache) : null;
}

export async function savePersonalVideoQuiz(
  ownerId: string,
  playlistId: string,
  videoId: string,
  questions: QuizQuestion[],
  sourceHash: string,
) {
  await setDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId, "quiz", "data"), {
    questions,
    generatedAt: serverTimestamp(),
    sourceHash,
  }, { merge: true });
}
