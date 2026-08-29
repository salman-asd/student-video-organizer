import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment,
  orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PersonalPlaylist, PersonalPlaylistSortMode, PersonalPlaylistVisibility, PersonalVideo, PriorityLevel, WatchStatus } from "@/types";

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

export async function createPersonalPlaylist(
  ownerId: string,
  title: string,
  description = "",
  visibility: PersonalPlaylistVisibility = "private"
): Promise<string> {
  const ref = await addDoc(playlistsCol(ownerId), {
    title,
    description,
    visibility,
    sortMode: "custom" as PersonalPlaylistSortMode,
    sortOrder: [],
    videoCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renamePersonalPlaylist(
  ownerId: string,
  playlistId: string,
  title: string,
  description?: string,
  visibility?: PersonalPlaylistVisibility,
) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    title,
    ...(description !== undefined ? { description } : {}),
    ...(visibility ? { visibility } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function setPersonalPlaylistSortMode(
  ownerId: string,
  playlistId: string,
  sortMode: PersonalPlaylistSortMode,
) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    sortMode,
    updatedAt: serverTimestamp(),
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

export async function addExistingVideoToPersonalPlaylist(
  ownerId: string,
  playlistId: string,
  video: {
    title: string;
    videoUrl: string;
    youtubeVideoId?: string | null;
    thumbnailUrl: string;
    durationSeconds?: number;
    description?: string | null;
    creator?: string | null;
    platform?: "youtube" | "youtube-shorts" | "facebook" | "vimeo" | "generic";
  }
): Promise<boolean> {
  const duplicate = await findDuplicatePersonalVideoUrl(ownerId, playlistId, video.videoUrl);
  if (duplicate) return false;
  await addPersonalVideo(ownerId, playlistId, video);
  return true;
}

export async function bulkAddVideosToPersonalPlaylist(
  ownerId: string,
  playlistId: string,
  videoList: Array<{
    title: string;
    videoUrl: string;
    youtubeVideoId?: string | null;
    thumbnailUrl: string;
    durationSeconds?: number;
    description?: string | null;
    creator?: string | null;
    platform?: "youtube" | "youtube-shorts" | "facebook" | "vimeo" | "generic";
  }>
): Promise<number> {
  if (videoList.length === 0) return 0;

  const existing = await listPersonalVideos(ownerId, playlistId);
  const existingUrls = new Set(existing.map((video) => video.videoUrl.trim().toLowerCase()));
  const uniqueVideos = videoList.filter((video) => !existingUrls.has(video.videoUrl.trim().toLowerCase()));
  if (uniqueVideos.length === 0) return 0;

  const playlistRef = doc(db, "users", ownerId, "personalPlaylists", playlistId);
  const playlistSnap = await getDoc(playlistRef);
  const currentSortOrder = (playlistSnap.exists() ? (playlistSnap.data().sortOrder as string[] | undefined) : []) || [];

  // A Firestore batch caps out at 500 writes. A large imported playlist
  // (a few hundred videos is common) plus the trailing playlist-doc update
  // could exceed that, so video writes are chunked defensively — each
  // chunk is its own batch, and the playlist doc (sortOrder/videoCount) is
  // only updated once, after every chunk has committed.
  const CHUNK_SIZE = 400;
  const allNewIds: string[] = [];
  for (let start = 0; start < uniqueVideos.length; start += CHUNK_SIZE) {
    const chunk = uniqueVideos.slice(start, start + CHUNK_SIZE);
    const batch = writeBatch(db);
    const refs = chunk.map(() => doc(videosCol(ownerId, playlistId)));
    refs.forEach((ref, i) => {
      batch.set(ref, {
        ...chunk[i],
        order: existing.length + start + i,
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
    });
    await batch.commit();
    allNewIds.push(...refs.map((ref) => ref.id));
  }

  await updateDoc(playlistRef, {
    sortOrder: [...currentSortOrder, ...allNewIds],
    sortMode: "custom" as PersonalPlaylistSortMode,
    videoCount: increment(uniqueVideos.length),
    updatedAt: serverTimestamp(),
  });

  return uniqueVideos.length;
}

export async function addPersonalVideo(
  ownerId: string,
  playlistId: string,
  data: {
    title: string;
    videoUrl: string;
    youtubeVideoId?: string | null;
    thumbnailUrl: string;
    durationSeconds?: number;
    description?: string | null;
    creator?: string | null;
    publishedAt?: string | null;
    platform?: "youtube" | "youtube-shorts" | "facebook" | "vimeo" | "generic";
  }
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

  const playlistRef = doc(db, "users", ownerId, "personalPlaylists", playlistId);
  const playlistSnap = await getDoc(playlistRef);
  const currentSortOrder = (playlistSnap.exists() ? (playlistSnap.data().sortOrder as string[] | undefined) : []) || [];

  await updateDoc(playlistRef, {
    sortOrder: [...currentSortOrder, ref.id],
    sortMode: "custom" as PersonalPlaylistSortMode,
    videoCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function findDuplicatePersonalVideoUrl(ownerId: string, playlistId: string, candidateUrl: string): Promise<boolean> {
  const normalized = candidateUrl.trim();
  if (!normalized) return false;

  const list = await listPersonalVideos(ownerId, playlistId);
  const canonicalCandidate = (() => {
    try {
      const parsed = new URL(normalized);
      return parsed.href;
    } catch {
      return normalized.toLowerCase();
    }
  })();

  return list.some((video) => {
    const current = video.videoUrl.trim();
    try {
      return new URL(current).href === canonicalCandidate;
    } catch {
      return current.toLowerCase() === canonicalCandidate.toLowerCase();
    }
  });
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

  const playlistRef = doc(db, "users", ownerId, "personalPlaylists", playlistId);
  const playlistSnap = await getDoc(playlistRef);
  const existingSortOrder = (playlistSnap.exists() ? (playlistSnap.data().sortOrder as string[] | undefined) : []) || [];

  await updateDoc(playlistRef, {
    sortOrder: existingSortOrder.filter((id) => id !== videoId),
    sortMode: "custom" as PersonalPlaylistSortMode,
    videoCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

export async function bulkUpdatePersonalVideos(
  ownerId: string,
  playlistId: string,
  videoIds: string[],
  patch: Record<string, any>
) {
  if (videoIds.length === 0) return;
  const batch = writeBatch(db);
  videoIds.forEach((videoId) => {
    batch.update(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function bulkRemovePersonalVideos(ownerId: string, playlistId: string, videoIds: string[]) {
  if (videoIds.length === 0) return;
  const playlistRef = doc(db, "users", ownerId, "personalPlaylists", playlistId);
  const playlistSnap = await getDoc(playlistRef);
  const existingSortOrder = (playlistSnap.exists() ? (playlistSnap.data().sortOrder as string[] | undefined) : []) || [];
  const batch = writeBatch(db);

  videoIds.forEach((videoId) => {
    batch.delete(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId));
  });

  batch.update(playlistRef, {
    sortOrder: existingSortOrder.filter((id) => !videoIds.includes(id)),
    sortMode: "custom" as PersonalPlaylistSortMode,
    videoCount: increment(-videoIds.length),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function reorderPersonalVideos(ownerId: string, playlistId: string, orderedVideoIds: string[]) {
  const batch = writeBatch(db);
  orderedVideoIds.forEach((videoId, index) => {
    batch.update(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
      order: index, updatedAt: serverTimestamp(),
    });
  });
  batch.update(doc(db, "users", ownerId, "personalPlaylists", playlistId), {
    sortOrder: orderedVideoIds,
    sortMode: "custom" as PersonalPlaylistSortMode,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function movePersonalVideo(ownerId: string, playlistId: string, videoId: string, direction: "up" | "down") {
  const videos = await listPersonalVideos(ownerId, playlistId);
  const index = videos.findIndex((video) => video.id === videoId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= videos.length) return;

  const reordered = [...videos];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved);
  await reorderPersonalVideos(ownerId, playlistId, reordered.map((video) => video.id));
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

export async function bulkSetPersonalVideosWatched(ownerId: string, playlistId: string, videoIds: string[], watched: boolean) {
  await bulkUpdatePersonalVideos(ownerId, playlistId, videoIds, {
    status: watched ? "completed" : "not_started",
    watchedPercentage: watched ? 100 : 0,
    completedAt: watched ? serverTimestamp() : null,
  });
}

export async function togglePersonalVideoFavorite(ownerId: string, playlistId: string, videoId: string, value: boolean) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    isFavorite: value, updatedAt: serverTimestamp(),
  });
}

export async function bulkTogglePersonalVideoFavorite(ownerId: string, playlistId: string, videoIds: string[], value: boolean) {
  await bulkUpdatePersonalVideos(ownerId, playlistId, videoIds, { isFavorite: value });
}

export async function togglePersonalVideoWatchLater(ownerId: string, playlistId: string, videoId: string, value: boolean) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    isWatchLater: value, watchLaterOrder: value ? Date.now() : null, updatedAt: serverTimestamp(),
  });
}

export async function bulkTogglePersonalVideoWatchLater(ownerId: string, playlistId: string, videoIds: string[], value: boolean) {
  await bulkUpdatePersonalVideos(ownerId, playlistId, videoIds, { isWatchLater: value });
}

export async function setPersonalVideoPriority(ownerId: string, playlistId: string, videoId: string, priority: PriorityLevel) {
  await updateDoc(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", videoId), {
    priority, priorityOrder: priority ? Date.now() : null, updatedAt: serverTimestamp(),
  });
}

/** Persist manual drag-and-drop order for a cross-playlist personal list
 *  (Watch Later / Priority). Each entry may belong to a different personal
 *  playlist, so — unlike reorderPersonalVideos — every write targets its
 *  own video doc individually rather than one shared playlist's sortOrder.
 *  `indices` lets a caller pass each item's position in a larger merged
 *  list (e.g. one that also mixes in shared-library videos) instead of
 *  renumbering from 0 — defaults to the array's own order when omitted. */
export async function reorderPersonalVideoList(
  ownerId: string,
  entries: { id: string; playlistId: string }[],
  field: "watchLaterOrder" | "priorityOrder",
  indices?: number[]
) {
  const batch = writeBatch(db);
  entries.forEach(({ id, playlistId }, i) => {
    const index = indices ? indices[i] : i;
    batch.update(doc(db, "users", ownerId, "personalPlaylists", playlistId, "videos", id), {
      [field]: index,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

/** Aggregates every video across all of a user's personal playlists — used
 *  by the cross-cutting personal views (Watch Later, Favorites, Priority,
 *  Continue Watching, Dashboard) so that state set from within "My
 *  Playlists" (favorite / watch later / priority / watched) actually shows
 *  up on those pages instead of being invisible outside the single
 *  playlist it was set in. Mirrors useVideoLibrary's per-playlist fetch
 *  pattern for the shared library, kept simple over a collectionGroup
 *  query so no extra Firestore rules are needed. */
export async function listAllPersonalVideos(ownerId: string): Promise<(PersonalVideo & { playlistTitle: string })[]> {
  const playlists = await listPersonalPlaylists(ownerId);
  const results = await Promise.all(
    playlists.map(async (p) => {
      const vids = await listPersonalVideos(ownerId, p.id);
      return vids.map((v) => ({ ...v, playlistTitle: p.title }));
    })
  );
  return results.flat();
}

export async function bulkSetPersonalVideoPriority(ownerId: string, playlistId: string, videoIds: string[], priority: PriorityLevel) {
  await bulkUpdatePersonalVideos(ownerId, playlistId, videoIds, { priority });
}
