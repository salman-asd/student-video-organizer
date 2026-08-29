import type { ShareVisibility, ShareRecord } from "@/types";

export interface ShareAccessContext {
  ownerUid: string;
  visibility: ShareVisibility;
  revokedAt: Date | { toDate?: () => Date } | null;
  token: string;
}

export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : null;

  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error("Secure randomness is unavailable in this environment.");
  }

  cryptoApi.getRandomValues(bytes);

  const encoded = typeof Buffer !== "undefined"
    ? Buffer.from(bytes).toString("base64")
    : btoa(String.fromCharCode(...Array.from(bytes)));

  return encoded
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 32);
}

export function isShareRevoked(share: { revokedAt?: unknown }): boolean {
  const revokedAt = share?.revokedAt;
  if (revokedAt == null) return false;

  if (revokedAt instanceof Date) {
    return !Number.isNaN(revokedAt.getTime());
  }

  if (typeof revokedAt === "object") {
    const maybeTimestamp = revokedAt as { toDate?: () => Date; seconds?: number };

    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      return !!date && !Number.isNaN(date.getTime());
    }

    if (typeof maybeTimestamp.seconds === "number") {
      return true;
    }

    return false;
  }

  return !!revokedAt;
}

export function resolveShareVisibilityState(
  currentRevokedAt: unknown,
  nextVisibility: ShareVisibility,
  revokeNow = false,
): { visibility: ShareVisibility; revokedAt: Date | { toDate?: () => Date } | null } {
  if (revokeNow) {
    return { visibility: "private", revokedAt: new Date() };
  }

  if (nextVisibility === "private") {
    return { visibility: "private", revokedAt: null };
  }

  return {
    visibility: nextVisibility,
    revokedAt: null,
  };
}

export function canReadSharedItem(share: ShareAccessContext, viewerUid?: string | null): boolean {
  if (!share.token || share.token.length < 20) return false;
  if (isShareRevoked(share)) return false;
  if (share.visibility === "private") return !!viewerUid && viewerUid === share.ownerUid;
  return true;
}

export function canManageShare(share: Pick<ShareAccessContext, "ownerUid">, viewerUid?: string | null): boolean {
  return !!viewerUid && viewerUid === share.ownerUid;
}

export function getShareUrl(token: string, type: "video" | "playlist", baseUrl?: string): string {
  const origin = baseUrl || (typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  return `${origin}/share/${type}/${token}`;
}

export function getShareDocSummary(share: Partial<ShareRecord> | null): string {
  if (!share) return "This shared item is unavailable.";
  if (share.entityType === "playlist") return `Shared playlist: ${share.title || "Untitled playlist"}`;
  return `Shared video: ${share.title || "Untitled video"}`;
}
