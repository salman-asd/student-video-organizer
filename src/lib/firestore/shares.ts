import {
  collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp,
  setDoc, updateDoc, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCategory } from "@/lib/firestore/categoriesTags";
import { computeExpiresAt, generateShareToken, isShareExpired, isShareRevoked, resolveShareVisibilityState } from "@/lib/sharing";
import type { ShareRecord, ShareVisibility, ShareEntityType, ShareExpiryOption, Video, PersonalPlaylist, Playlist, VideoPlatform, ShareApprovalStatus } from "@/types";

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
  categoryId?: string | null;
};

type PlaylistShareInput = {
  id: string;
  title: string;
  description?: string | null;
  videoCount: number;
  coverThumbnailUrl?: string | null;
  categoryId?: string | null;
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

export async function listSharesByOwner(ownerUid: string): Promise<ShareRecord[]> {
  const snap = await getDocs(query(sharesCol(), where("ownerUid", "==", ownerUid)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ShareRecord);
}

export async function listSharesForRecipient(recipientUid: string): Promise<ShareRecord[]> {
  const snap = await getDocs(query(sharesCol(), where("recipientUid", "==", recipientUid)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }) as ShareRecord);
}

export async function setShareApproval(token: string, recipientUid: string, approvalStatus: ShareApprovalStatus) {
  await updateDoc(doc(db, "shares", token), {
    approvalStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function createDirectedShare(
  ownerUid: string,
  share: ShareRecord,
  recipientEmail: string,
  recipientUid: string | null,
  sharedByName?: string | null,
): Promise<ShareRecord> {
  const token = generateShareToken();
  const record: ShareRecord = {
    ...share,
    id: token,
    shareToken: token,
    visibility: "private",
    recipientEmail: recipientEmail.trim().toLowerCase(),
    recipientUid,
    approvalStatus: recipientUid ? "pending" : null,
    sharedByName: sharedByName || null,
    ownerUid,
    revokedAt: null,
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };
  await setDoc(doc(db, "shares", token), record);
  return record;
}

export async function createOrUpdateVideoShare(
  ownerUid: string,
  video: VideoShareInput,
  visibility: ShareVisibility = "private",
  revokeNow = false,
  expiryOption?: ShareExpiryOption,
) {
  const existing = await findShareForEntity(ownerUid, "video", video.id);
  const token = existing?.shareToken || generateShareToken();
  const nextState = resolveShareVisibilityState(existing?.revokedAt, visibility, revokeNow);
  // Explicitly recomputed on every write (rather than omitted when
  // unchanged) so the field is always present in Firestore — a Firestore
  // rule reading a genuinely-missing map key throws, so leaving it out of
  // brand-new documents would be riskier than just always setting it.
  const expiresAt = expiryOption !== undefined ? computeExpiresAt(expiryOption) : (existing?.expiresAt ?? null);

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
    categoryName: video.categoryId ? (await getCategory(ownerUid, video.categoryId))?.name || null : null,
    revokedAt: revokeNow ? (serverTimestamp() as any) : null,
    expiresAt: expiresAt as any,
    createdAt: existing?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, "shares", token), record, { merge: true });
  return record;
}

export async function createOrUpdatePlaylistShare(
  ownerUid: string,
  playlist: PlaylistShareInput,
  videos: Array<{ id: string; title: string; videoUrl: string; thumbnailUrl?: string | null; durationSeconds?: number | null; platform?: any; categoryId?: string | null }>,
  visibility: ShareVisibility = "private",
  revokeNow = false,
  expiryOption?: ShareExpiryOption,
) {
  const existing = await findShareForEntity(ownerUid, "playlist", playlist.id);
  const token = existing?.shareToken || generateShareToken();
  const nextState = resolveShareVisibilityState(existing?.revokedAt, visibility, revokeNow);
  const expiresAt = expiryOption !== undefined ? computeExpiresAt(expiryOption) : (existing?.expiresAt ?? null);

  const playlistCategory = playlist.categoryId ? await getCategory(ownerUid, playlist.categoryId) : null;
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
    categoryName: playlistCategory?.name || null,
    videos: await Promise.all(videos.map(async (video) => ({
      id: video.id,
      title: video.title,
      videoUrl: video.videoUrl,
      thumbnailUrl: video.thumbnailUrl || null,
      durationSeconds: video.durationSeconds || null,
      platform: video.platform,
      categoryName: video.categoryId ? (await getCategory(ownerUid, video.categoryId))?.name || null : null,
    }))),
    revokedAt: revokeNow ? (serverTimestamp() as any) : null,
    expiresAt: expiresAt as any,
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
  if (isShareExpired(share)) return false;
  if (share.visibility === "private") return !!viewerUid && viewerUid === share.ownerUid;
  return true;
}

export async function deleteShare(token: string) {
  await deleteDoc(doc(db, "shares", token));
}
