import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment,
  orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PersonalPlaylist, PersonalVideo, PriorityLevel, WatchStatus } from "@/types";

/**
 * Personal playlists live under users/{ownerId}/personalPlaylists/{id} —
 * separate from the shared /playlists collection. `ownerId` is always
 * required explicitly (rather than assumed to be "the current user") so the
 * same functions can be reused by the admin UI when an admin is managing a
 * specific student's personal library (see firestore.rules: owner OR admin).
 */
const playlistsCol = (ownerId: string) => collection(db, "users", ownerId, "personalPlaylists");
const videosCol = (ownerId: string, playlistId: string) =>
  collection(db, "users", ownerId, "personalPlaylists", playlistId, "videos");

export async function listPersonalPlaylists(ownerId: string): Promise<PersonalPlaylist[]> {
  const snap = await getDocs(playlistsCol(ownerId));
  return snap.docs.map((d) => ({ id: d.id, ownerId, ...d.data() }) as PersonalPlaylist);
}

export async function getPersonalPlaylist(ownerId: string, playlistId: string): Promise<PersonalPlaylist | null> {
  const snap = await getDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId));
  return snap.exists() ? ({ id: snap.id, ownerId, ...snap.data() } as PersonalPlaylist) : null;
}

export async function createPersonalPlaylist(ownerId: string, title: string, description = ""): Promise<string> {
  const ref = await addDoc(playlistsCol(ownerId), {
    title, description, videoCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renamePersonalPlaylist(ownerId: string, playlistId: string, title: string, description?: string) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    title, ...(description !== undefined ? { description } : {}), updatedAt: serverTimestamp(),
  });
}

export async function deletePersonalPlaylist(ownerId: string, playlistId: string) {
  const vids = await getDocs(videosCol(ownerId, playlistId));
  const batch = writeBatch(db);
  vids.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "users", ownerId, "personalPlaylists", playlistId));
  await batch.commit();
}

export async function listPersonalVideos(ownerId: string, playlistId: string): Promise<PersonalVideo[]> {
  const q = query(videosCol(ownerId, playlistId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, playlistId, ownerId, ...d.data() }) as PersonalVideo);
}

export async function getPersonalVideo(ownerId: string, playlistId: string, videoId: string): Promise<PersonalVideo | null> {
  const snap = await getDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId));
  return snap.exists() ? ({ id: snap.id, playlistId, ownerId, ...snap.data() } as PersonalVideo) : null;
}

export async function addPersonalVideo(
  ownerId: string,
  playlistId: string,
  data: { title: string; videoUrl: string; youtubeVideoId?: string | null; thumbnailUrl: string; durationSeconds?: number }
): Promise<string> {
  const existing = await getDocs(videosCol(ownerId, playlistId));
  const ref = await addDoc(videosCol(ownerId, playlistId), {
    ...data,
    order: existing.size,
    status: "not_started" as WatchStatus,
    watchedPercentage: 0,
    currentPositionSeconds: 0,
    isFavorite: false,
    isWatchLater: false,
    priority: null,
    lastWatchedAt: null,
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    videoCount: increment(1), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePersonalVideoMeta(
  ownerId: string, playlistId: string, videoId: string,
  data: Partial<Pick<PersonalVideo, "title" | "videoUrl" | "thumbnailUrl" | "durationSeconds">>
) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    ...data, updatedAt: serverTimestamp(),
  });
}

export async function removePersonalVideo(ownerId: string, playlistId: string, videoId: string) {
  await deleteDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId));
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    videoCount: increment(-1), updatedAt: serverTimestamp(),
  });
}

export async function reorderPersonalVideos(ownerId: string, playlistId: string, orderedVideoIds: string[]) {
  const batch = writeBatch(db);
  orderedVideoIds.forEach((videoId, index) => {
    batch.update(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
      order: index, updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/** Progress/favorite/watchLater/priority live directly on the video doc
 *  since only the owner (or admin) ever reads/writes it — no separate
 *  "state" collection needed here, unlike shared-library videos. */
export async function savePersonalVideoProgress(
  ownerId: string, playlistId: string, videoId: string,
  currentPositionSeconds: number, watchedPercentage: number
) {
  const status: WatchStatus = watchedPercentage >= 95 ? "completed" : watchedPercentage > 0 ? "in_progress" : "not_started";
  const patch: any = {
    currentPositionSeconds,
    watchedPercentage: Math.min(100, Math.round(watchedPercentage)),
    status,
    lastWatchedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (status === "completed") patch.completedAt = serverTimestamp();
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), patch);
}

export async function setPersonalVideoWatched(ownerId: string, playlistId: string, videoId: string, watched: boolean) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    status: watched ? "completed" : "not_started",
    watchedPercentage: watched ? 100 : 0,
    completedAt: watched ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function togglePersonalVideoFavorite(ownerId: string, playlistId: string, videoId: string, value: boolean) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    isFavorite: value, updatedAt: serverTimestamp(),
  });
}

export async function togglePersonalVideoWatchLater(ownerId: string, playlistId: string, videoId: string, value: boolean) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    isWatchLater: value, updatedAt: serverTimestamp(),
  });
}

export async function setPersonalVideoPriority(ownerId: string, playlistId: string, videoId: string, priority: PriorityLevel) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    priority, updatedAt: serverTimestamp(),
  });
}
