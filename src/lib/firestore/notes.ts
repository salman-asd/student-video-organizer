import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeNoteContent } from "@/lib/noteUtils";
import type { VideoNote, VideoSummary } from "@/types";

export async function getNote(uid: string, videoId: string): Promise<VideoNote | null> {
  const snap = await getDoc(doc(db, "users", uid, "notes", videoId));
  return snap.exists() ? (snap.data() as VideoNote) : null;
}

export async function saveNote(uid: string, videoId: string, content: string) {
  const normalized = normalizeNoteContent(content);
  if (!normalized) {
    await deleteNote(uid, videoId);
    return;
  }

  await setDoc(doc(db, "users", uid, "notes", videoId), { videoId, content: normalized, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteNote(uid: string, videoId: string) {
  await deleteDoc(doc(db, "users", uid, "notes", videoId));
}

export async function getSummary(uid: string, videoId: string): Promise<VideoSummary | null> {
  const snap = await getDoc(doc(db, "users", uid, "summaries", videoId));
  return snap.exists() ? (snap.data() as VideoSummary) : null;
}

export async function saveSummary(uid: string, videoId: string, content: string) {
  await setDoc(doc(db, "users", uid, "summaries", videoId), { videoId, content, updatedAt: serverTimestamp() }, { merge: true });
}
