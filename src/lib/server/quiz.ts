import admin from "firebase-admin";
import { adminDb } from "@/lib/server/firebase-admin";
import type { QuizQuestion, VideoQuizCache } from "@/types";

function sharedQuizRef(playlistId: string, videoId: string) {
  return adminDb.doc(`playlists/${playlistId}/videos/${videoId}/quiz/data`); // ✅ added /data
}

function personalQuizRef(ownerId: string, playlistId: string, videoId: string) {
  return adminDb.doc(`users/${ownerId}/personalPlaylists/${playlistId}/videos/${videoId}/quiz/data`); // ✅ added /data
}

async function getQuiz(ref: FirebaseFirestore.DocumentReference): Promise<VideoQuizCache | null> {
  const snap = await ref.get();
  return snap.exists ? (snap.data() as VideoQuizCache) : null;
}

async function saveQuiz(
  ref: FirebaseFirestore.DocumentReference,
  questions: QuizQuestion[],
  sourceHash: string,
): Promise<void> {
  await ref.set({
    questions,
    sourceHash,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export function getSharedVideoQuiz(playlistId: string, videoId: string) {
  return getQuiz(sharedQuizRef(playlistId, videoId));
}

export function saveSharedVideoQuiz(playlistId: string, videoId: string, questions: QuizQuestion[], sourceHash: string) {
  return saveQuiz(sharedQuizRef(playlistId, videoId), questions, sourceHash);
}

export function getPersonalVideoQuiz(ownerId: string, playlistId: string, videoId: string) {
  return getQuiz(personalQuizRef(ownerId, playlistId, videoId));
}

export function savePersonalVideoQuiz(ownerId: string, playlistId: string, videoId: string, questions: QuizQuestion[], sourceHash: string) {
  return saveQuiz(personalQuizRef(ownerId, playlistId, videoId), questions, sourceHash);
}
