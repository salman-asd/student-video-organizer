import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeNoteContent } from "@/lib/noteUtils";
import { needsMigration, normalizeSummaryContent } from "@/lib/richText";
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
  if (!snap.exists()) return null;

  const data = snap.data() as VideoSummary;
  const stored = data.content ?? "";

  // Lazy one-time migration of legacy markdown/plain-text summaries to the
  // canonical HTML format (see src/lib/richText.ts). Done here rather than in
  // a bulk script because it only needs to happen for documents that are
  // actually opened, and it never rewrites content that is already HTML — so
  // reading an up-to-date summary causes no write at all.
  if (needsMigration(stored)) {
    const migrated = normalizeSummaryContent(stored);
    // Fire-and-forget: the read must not fail or slow down because the
    // upgrade write did. Worst case the next open retries it.
    void setDoc(
      doc(db, "users", uid, "summaries", videoId),
      { videoId, content: migrated, updatedAt: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
    return { ...data, content: migrated };
  }

  return data;
}

/**
 * Persists a summary.
 *
 * Content is normalized to canonical HTML before storing, so every caller can
 * hand over whatever it has (editor output, AI-generated text, a markdown
 * paste) the database only ever holds one format going forward.
 */
export async function saveSummary(uid: string, videoId: string, content: string) {
  const normalized = normalizeSummaryContent(content);
  await setDoc(
    doc(db, "users", uid, "summaries", videoId),
    { videoId, content: normalized, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
