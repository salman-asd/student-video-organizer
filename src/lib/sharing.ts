import type { ShareVisibility, ShareRecord, ShareExpiryOption } from "@/types";

export interface ShareAccessContext {
  ownerUid: string;
  visibility: ShareVisibility;
  revokedAt: Date | { toDate?: () => Date } | null;
  /** Optional — absent/undefined on shares created before this field
   *  existed, which is treated identically to null ("never expires"). */
  expiresAt?: Date | { toDate?: () => Date } | null;
  token: string;
  recipientUid?: string | null;
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

/** Coerces a Firestore Timestamp, plain Date, or null/undefined into a
 *  Date (or null) so revoked/expiry checks can compare consistently
 *  regardless of which shape the caller happens to be holding. */
function toDateOrNull(value: unknown): Date | null {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };

    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      return date && !Number.isNaN(date.getTime()) ? date : null;
    }

    if (typeof maybeTimestamp.seconds === "number") {
      return new Date(maybeTimestamp.seconds * 1000);
    }

    return null;
  }

  // Non-null, non-object values (shouldn't normally occur, but mirrors
  // firestore.rules' plain `!= null` comparison rather than silently
  // treating them as "not revoked"/"not expired").
  return value ? new Date() : null;
}

export function isShareRevoked(share: { revokedAt?: unknown }): boolean {
  return toDateOrNull(share?.revokedAt) != null;
}

/** Mirrors firestore.rules' isShareExpired(): a missing/null expiresAt
 *  means "never expires"; a past expiresAt means the link should read the
 *  same as a revoked one. */
export function isShareExpired(share: { expiresAt?: unknown }): boolean {
  const expiresAt = toDateOrNull(share?.expiresAt);
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}

/** Turns a ShareDialog "Expires" selection into the Date to persist as
 *  expiresAt ("never" clears it back to null). */
export function computeExpiresAt(option: ShareExpiryOption, from: Date = new Date()): Date | null {
  if (option === "never") return null;
  const hours = option === "1h" ? 1 : option === "24h" ? 24 : option === "7d" ? 7 * 24 : 30 * 24;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** Best-effort reverse mapping, used to preselect ShareDialog's "Expires"
 *  control when reopening a share that already has an expiry set. There's
 *  no exact inverse (a share could have any expiresAt, not just +7/+30
 *  days) so this buckets by days-remaining: <=7 days left shows "7d",
 *  otherwise "30d"; null/past shows "never". */
export function shareExpiryOptionFromDate(expiresAt: unknown): ShareExpiryOption {
  const date = toDateOrNull(expiresAt);
  if (!date) return "never";
  const daysRemaining = (date.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysRemaining <= 0) return "never";
  if (daysRemaining * 24 <= 1) return "1h";
  if (daysRemaining <= 1) return "24h";
  return daysRemaining <= 7 ? "7d" : "30d";
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
  if (isShareExpired(share)) return false;
  if (share.visibility === "private") return !!viewerUid && (viewerUid === share.ownerUid || viewerUid === share.recipientUid);
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
