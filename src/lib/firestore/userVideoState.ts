import {
  collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PriorityLevel, UserVideoState, WatchStatus } from "@/types";

const statesCol = (uid: string) => collection(db, "users", uid, "videoStates");
const stateDoc = (uid: string, videoId: string) => doc(db, "users", uid, "videoStates", videoId);

export function emptyState(videoId: string, playlistId: string): UserVideoState {
  return {
    videoId,
    playlistId,
    status: "not_started",
    watchedPercentage: 0,
    currentPositionSeconds: 0,
    isFavorite: false,
    isWatchLater: false,
    priority: null,
    lastWatchedAt: null,
    completedAt: null,
    updatedAt: null,
  };
}

export async function getAllUserVideoStates(uid: string): Promise<Record<string, UserVideoState>> {
  const snap = await getDocs(statesCol(uid));
  const map: Record<string, UserVideoState> = {};
  snap.docs.forEach((d) => (map[d.id] = d.data() as UserVideoState));
  return map;
}

export async function getUserVideoState(uid: string, videoId: string): Promise<UserVideoState | null> {
  const snap = await getDoc(stateDoc(uid, videoId));
  return snap.exists() ? (snap.data() as UserVideoState) : null;
}

async function upsert(uid: string, videoId: string, playlistId: string, patch: Partial<UserVideoState>) {
  await setDoc(
    stateDoc(uid, videoId),
    { videoId, playlistId, ...patch, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Called on pause / page-leave / video-ended / a periodic interval — NOT every second. */
export async function saveProgress(
  uid: string,
  videoId: string,
  playlistId: string,
  currentPositionSeconds: number,
  watchedPercentage: number
) {
  const status: WatchStatus = watchedPercentage >= 95 ? "completed" : watchedPercentage > 0 ? "in_progress" : "not_started";
  const patch: Partial<UserVideoState> = {
    currentPositionSeconds,
    watchedPercentage: Math.min(100, Math.round(watchedPercentage)),
    status,
    lastWatchedAt: serverTimestamp() as any,
  };
  if (status === "completed") patch.completedAt = serverTimestamp() as any;
  await upsert(uid, videoId, playlistId, patch);
}

export async function setWatchedStatus(uid: string, videoId: string, playlistId: string, watched: boolean) {
  await upsert(uid, videoId, playlistId, {
    status: watched ? "completed" : "not_started",
    watchedPercentage: watched ? 100 : 0,
    completedAt: watched ? (serverTimestamp() as any) : null,
  });
}

export async function toggleFavorite(uid: string, videoId: string, playlistId: string, value: boolean) {
  await upsert(uid, videoId, playlistId, { isFavorite: value });
}

export async function toggleWatchLater(uid: string, videoId: string, playlistId: string, value: boolean) {
  await upsert(uid, videoId, playlistId, { isWatchLater: value, watchLaterOrder: value ? Date.now() : undefined });
}

export async function setPriority(uid: string, videoId: string, playlistId: string, priority: PriorityLevel) {
  await upsert(uid, videoId, playlistId, { priority, priorityOrder: priority ? Date.now() : undefined });
}

/** Persist manual drag-and-drop order for a personal list (Watch Later / Priority / Queue).
 *  `indices` lets a caller pass each item's position in a larger merged list
 *  (e.g. one that also mixes in personal-playlist videos) instead of
 *  renumbering from 0 — defaults to the array's own order when omitted. */
export async function reorderPersonalList(
  uid: string,
  orderedVideoIds: string[],
  field: "watchLaterOrder" | "priorityOrder",
  indices?: number[]
) {
  const batch = writeBatch(db);
  orderedVideoIds.forEach((videoId, i) => {
    const index = indices ? indices[i] : i;
    batch.set(stateDoc(uid, videoId), { [field]: index, updatedAt: serverTimestamp() }, { merge: true });
  });
  await batch.commit();
}

export async function bulkUpdateStates(
  uid: string,
  videoIds: string[],
  playlistIdByVideo: Record<string, string>,
  patch: Partial<UserVideoState>
) {
  const batch = writeBatch(db);
  videoIds.forEach((videoId) => {
    batch.set(
      stateDoc(uid, videoId),
      { videoId, playlistId: playlistIdByVideo[videoId], ...patch, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
  await batch.commit();
}

export async function bulkSetWatchedStatus(
  uid: string,
  videoIds: string[],
  playlistIdByVideo: Record<string, string>,
  watched: boolean
) {
  await bulkUpdateStates(uid, videoIds, playlistIdByVideo, {
    status: watched ? "completed" : "not_started",
    watchedPercentage: watched ? 100 : 0,
    completedAt: watched ? (serverTimestamp() as any) : null,
  });
}

export async function bulkToggleFavorite(
  uid: string,
  videoIds: string[],
  playlistIdByVideo: Record<string, string>,
  value: boolean
) {
  await bulkUpdateStates(uid, videoIds, playlistIdByVideo, { isFavorite: value });
}

export async function bulkToggleWatchLater(
  uid: string,
  videoIds: string[],
  playlistIdByVideo: Record<string, string>,
  value: boolean
) {
  await bulkUpdateStates(uid, videoIds, playlistIdByVideo, { isWatchLater: value, watchLaterOrder: value ? Date.now() : undefined });
}

export async function bulkSetPriority(
  uid: string,
  videoIds: string[],
  playlistIdByVideo: Record<string, string>,
  priority: PriorityLevel
) {
  await bulkUpdateStates(uid, videoIds, playlistIdByVideo, { priority, priorityOrder: priority ? Date.now() : undefined });
}
