import { detectVideoPlatform } from "@/lib/video-platforms";
import { isExpiredOrExpiringSoon } from "@/lib/signedThumbnailUrl";

/**
 * Self-healing for Facebook thumbnails.
 *
 * Facebook thumbnail URLs are signed and expire, so a thumbnail that loaded
 * when the video was added stops loading later. Rather than wait for the user
 * to see a broken tile, pages ask this module which videos need a fresh URL,
 * fetch one from /api/facebook-video/thumbnail, and write it back.
 *
 * Pure planning functions live here (unit-testable); the React wiring is in
 * src/hooks/useThumbnailHealing.ts.
 */

export interface HealCandidate {
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}

/** How long before expiry we proactively refresh. */
export const REFRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
/** After trying a URL (success or not), leave it alone this long. Prevents
 *  hammering Facebook when a video is private or the scrape keeps failing. */
export const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Max URLs the API accepts per call. */
export const HEAL_BATCH_SIZE = 10;
/** Max videos healed per page visit, so opening a huge library stays cheap. */
export const HEAL_MAX_PER_VISIT = 30;

/** True for a Facebook video whose thumbnail is missing, expired, or about to expire. */
export function needsThumbnailRefresh(video: HealCandidate, now: Date = new Date()): boolean {
  if (!video.videoUrl || detectVideoPlatform(video.videoUrl) !== "facebook") return false;
  const thumb = (video.thumbnailUrl ?? "").trim();
  return !thumb || isExpiredOrExpiringSoon(thumb, now, REFRESH_WINDOW_MS);
}

/** Unique video URLs to refresh, skipping ones tried recently, capped per visit. */
export function pickHealTargets(
  videos: HealCandidate[],
  opts: { now?: Date; recentlyTried?: (url: string) => boolean; limit?: number } = {},
): string[] {
  const { now = new Date(), recentlyTried = () => false, limit = HEAL_MAX_PER_VISIT } = opts;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const video of videos) {
    const url = video.videoUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (!needsThumbnailRefresh(video, now) || recentlyTried(url)) continue;
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
  return out;
}

// ── Attempt log (localStorage, best effort) ────────────────────────────────
const ATTEMPT_KEY_PREFIX = "sl:thumb-heal:";

export function wasRecentlyAttempted(url: string, now: number = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(ATTEMPT_KEY_PREFIX + url);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) && at > 0 && now - at < RETRY_COOLDOWN_MS;
  } catch {
    return false;
  }
}

export function markAttempted(url: string, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(ATTEMPT_KEY_PREFIX + url, String(now));
  } catch {
    /* private mode / quota — the in-memory guard in the hook still prevents loops */
  }
}

// ── API client ─────────────────────────────────────────────────────────────
/** Asks the server for fresh thumbnails. Never throws: a failure is `{}`. */
export async function requestFreshThumbnails(
  idToken: string,
  urls: string[],
): Promise<Record<string, string | null>> {
  const merged: Record<string, string | null> = {};
  for (const batch of chunk(urls, HEAL_BATCH_SIZE)) {
    try {
      const res = await fetch("/api/facebook-video/thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ urls: batch }),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: Record<string, string | null> };
      Object.assign(merged, data.results ?? {});
    } catch {
      /* network hiccup — leave these to the next visit */
    }
  }
  return merged;
}
