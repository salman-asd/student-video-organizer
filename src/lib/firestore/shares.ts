import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateShareToken, isShareRevoked, resolveShareVisibilityState } from "@/lib/sharing";
import type { ShareRecord, ShareVisibility, ShareEntityType, Video, PersonalPlaylist, Playlist, VideoPlatform } from "@/types";

const sharesCol = () => collection(db, "shares");

type VideoShareInput = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  platform?: VideoPlatform;
  creatorName?: string | null;
  durationSeconds?: number | null;
};

type PlaylistShareInput = {
  id: string;
  title: string;
  description?: string | null;
  videoCount: number;
  coverThumbnailUrl?: string | null;
};

export async function getShareByToken(token: string): Promise<ShareRecord | null> {
  const snap = await getDoc(doc(db, "shares", token));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ShareRecord;
}

export async function findShareForEntity(ownerUid: string, entityType: ShareEntityType, entityId: string): Promise<ShareRecord | null> {
  const q = query(sharesCol(), where("ownerUid", "==", ownerUid), where("entityType", "==", entityType), where("entityId", "==", entityId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const [first] = snap.docs;
  return { id: first.id, ...first.data() } as ShareRecord;
}

export async function createOrUpdateVideoShare(ownerUid: string, video: VideoShareInput, visibility: ShareVisibility = "private", revokeNow = false) {
  const existing = await findShareForEntity(ownerUid, "video", video.id);
  const token = existing?.shareToken || generateShareToken();
  const nextState = resolveShareVisibilityState(existing?.revokedAt, visibility, revokeNow);

  const record: ShareRecord = {
    id: token,
    ownerUid,
    entityType: "video",
    entityId: video.id,
    visibility: nextState.visibility,
    shareToken: token,
    title: video.title,
    description: video.description || null,
    thumbnailUrl: video.thumbnailUrl || null,
    videoUrl: video.videoUrl || null,
    platform: video.platform || null,
    creatorName: video.creatorName || null,
    revokedAt: revokeNow ? (serverTimestamp() as any) : null,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "shares", token), record, { merge: true });
  return record;
}

export async function createOrUpdatePlaylistShare(ownerUid: string, playlist: PlaylistShareInput, videos: Array<{ id: string; title: string; videoUrl: string; thumbnailUrl?: string | null; durationSeconds?: number | null; platform?: any }>, visibility: ShareVisibility = "private", revokeNow = false) {
  const existing = await findShareForEntity(ownerUid, "playlist", playlist.id);
  const token = existing?.shareToken || generateShareToken();
  const nextState = resolveShareVisibilityState(existing?.revokedAt, visibility, revokeNow);

  const record: ShareRecord = {
    id: token,
    ownerUid,
    entityType: "playlist",
    entityId: playlist.id,
    visibility: nextState.visibility,
    shareToken: token,
    title: playlist.title,
    description: playlist.description || null,
    thumbnailUrl: (playlist as any).coverThumbnailUrl || null,
    videos: videos.map((video) => ({
      id: video.id,
      title: video.title,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || null,
      durationSeconds: video.durationSeconds || null,
      platform: video.platform,
    })),
    revokedAt: revokeNow ? (serverTimestamp() as any) : null,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "shares", token), record, { merge: true });
  return record;
}

export async function updateShareVisibility(token: string, visibility: ShareVisibility) {
  const nextState = resolveShareVisibilityState(null, visibility, false);
  await updateDoc(doc(db, "shares", token), {
    visibility: nextState.visibility,
    revokedAt: nextState.revokedAt,
    updatedAt: serverTimestamp(),
  });
}

export async function revokeShare(token: string) {
  await updateDoc(doc(db, "shares", token), {
    revokedAt: serverTimestamp(),
    visibility: "private",
    updatedAt: serverTimestamp(),
  });
}

export async function setShareVisibility(token: string, visibility: ShareVisibility) {
  const nextState = resolveShareVisibilityState(null, visibility, false);
  await updateDoc(doc(db, "shares", token), {
    visibility: nextState.visibility,
    revokedAt: nextState.revokedAt,
    updatedAt: serverTimestamp(),
  });
}

export async function canReadShareToken(token: string, viewerUid?: string | null): Promise<boolean> {
  const share = await getShareByToken(token);
  if (!share) return false;
  if (isShareRevoked(share)) return false;
  if (share.visibility === "private") return !!viewerUid && viewerUid === share.ownerUid;
  return true;
}

export async function deleteShare(token: string) {
  await deleteDoc(doc(db, "shares", token));
}
