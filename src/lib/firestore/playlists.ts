import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment,
  orderBy, query, serverTimestamp, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Playlist, Video } from "@/types";

const playlistsCol = () => collection(db, "playlists");
const videosCol = (playlistId: string) => collection(db, "playlists", playlistId, "videos");

export async function listPlaylists(includeArchived = false): Promise<Playlist[]> {
  const snap = await getDocs(playlistsCol());
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Playlist);
  return includeArchived ? all : all.filter((p) => p.visibility !== "archived");
}

export async function getPlaylist(playlistId: string): Promise<Playlist | null> {
  const snap = await getDoc(doc(db, "playlists", playlistId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Playlist) : null;
}

export async function createPlaylist(
  data: Pick<Playlist, "title" | "description" | "categoryId" | "tagIds" | "source" | "sourceUrl">,
  createdBy: string
): Promise<string> {
  const ref = await addDoc(playlistsCol(), {
    title: data.title,
    description: data.description || "",
    categoryId: data.categoryId || null,
    tagIds: data.tagIds || [],
    visibility: "shared",
    videoCount: 0,
    source: data.source,
    sourceUrl: data.sourceUrl || null,
    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlaylist(playlistId: string, data: Partial<Playlist>) {
  await updateDoc(doc(db, "playlists", playlistId), { ...data, updatedAt: serverTimestamp() });
}

export async function archivePlaylist(playlistId: string, archived: boolean) {
  await updateDoc(doc(db, "playlists", playlistId), {
    visibility: archived ? "archived" : "shared",
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlaylist(playlistId: string) {
  // Small dataset assumption (per README): delete videos then the playlist.
  const vids = await getDocs(videosCol(playlistId));
  const batch = writeBatch(db);
  vids.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "playlists", playlistId));
  await batch.commit();
}

export async function listVideos(playlistId: string): Promise<Video[]> {
  const q = query(videosCol(playlistId), orderBy("order", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, playlistId, ...d.data() }) as Video);
}

export async function getVideo(playlistId: string, videoId: string): Promise<Video | null> {
  const snap = await getDoc(doc(db, "playlists", playlistId, "videos", videoId));
  return snap.exists() ? ({ id: snap.id, playlistId, ...snap.data() } as Video) : null;
}

export async function addVideo(
  playlistId: string,
  data: Omit<Video, "id" | "playlistId" | "order" | "createdAt" | "updatedAt">
): Promise<string> {
  const existing = await getDocs(videosCol(playlistId));
  const order = existing.size;
  const ref = await addDoc(videosCol(playlistId), {
    ...data,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, "playlists", playlistId), { videoCount: increment(1), updatedAt: serverTimestamp() });
  return ref.id;
}

export async function updateVideo(playlistId: string, videoId: string, data: Partial<Video>) {
  await updateDoc(doc(db, "playlists", playlistId, "videos", videoId), { ...data, updatedAt: serverTimestamp() });
}

export async function removeVideo(playlistId: string, videoId: string) {
  await deleteDoc(doc(db, "playlists", playlistId, "videos", videoId));
  await updateDoc(doc(db, "playlists", playlistId), { videoCount: increment(-1), updatedAt: serverTimestamp() });
}

/** Persist a new video order after drag & drop. Uses one batched write. */
export async function reorderVideos(playlistId: string, orderedVideoIds: string[]) {
  const batch = writeBatch(db);
  orderedVideoIds.forEach((videoId, index) => {
    batch.update(doc(db, "playlists", playlistId, "videos", videoId), { order: index, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

/** Bulk-add videos in preserved order (used by JSON / YouTube playlist import). One batch write. */
export async function bulkAddVideos(
  playlistId: string,
  items: Array<Omit<Video, "id" | "playlistId" | "order" | "createdAt" | "updatedAt">>
): Promise<number> {
  const existing = await getDocs(videosCol(playlistId));
  let order = existing.size;
  const batch = writeBatch(db);
  for (const item of items) {
    const ref = doc(videosCol(playlistId));
    batch.set(ref, { ...item, order: order++, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  batch.update(doc(db, "playlists", playlistId), { videoCount: increment(items.length), updatedAt: serverTimestamp() });
  await batch.commit();
  return items.length;
}

/** Move a single video from one shared playlist to another (keeps it shared). */
export async function moveVideoToPlaylist(fromPlaylistId: string, toPlaylistId: string, videoId: string) {
  const videoSnap = await getDoc(doc(db, "playlists", fromPlaylistId, "videos", videoId));
  if (!videoSnap.exists()) return;
  const data = videoSnap.data();
  const destVideos = await getDocs(videosCol(toPlaylistId));
  const batch = writeBatch(db);
  batch.set(doc(db, "playlists", toPlaylistId, "videos", videoId), { ...data, order: destVideos.size, updatedAt: serverTimestamp() });
  batch.delete(doc(db, "playlists", fromPlaylistId, "videos", videoId));
  batch.update(doc(db, "playlists", fromPlaylistId), { videoCount: increment(-1) });
  batch.update(doc(db, "playlists", toPlaylistId), { videoCount: increment(1) });
  await batch.commit();
}
