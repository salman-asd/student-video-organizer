import type { PlaylistSummary } from "@/types";
import { hasExpiredSignedUrl } from "@/lib/signedThumbnailUrl";

/**
 * Pure rollup behind the Playlists page cards (see PlaylistSummary in types).
 *
 * Kept free of Firestore/React so the rules — which cover to show, what "next"
 * means, when a summary is out of date — are unit-testable.
 */

export interface SummaryVideo {
  id: string;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  status?: string | null;
  order?: number | null;
  lastWatchedAt?: unknown;
}

export const MAX_COVERS = 3;

type Comparable = Omit<PlaylistSummary, "computedAt" | "lastWatchedAt">;

export function millis(value: unknown): number {
  if (!value) return 0;
  const v = value as { toMillis?: () => number; toDate?: () => Date };
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/** Playlist order: explicit `sortOrder` ids first (custom drag order), then the `order` field. */
export function orderVideos<T extends SummaryVideo>(videos: T[], sortOrder: string[] = []): T[] {
  const index = new Map(sortOrder.map((id, i) => [id, i]));
  return [...videos].sort((a, b) => {
    const ai = index.get(a.id);
    const bi = index.get(b.id);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

export function computePlaylistSummary(
  videos: SummaryVideo[],
  sortOrder: string[] = [],
  now: Date = new Date(),
): Omit<PlaylistSummary, "computedAt" | "lastWatchedAt"> & { lastWatchedAtMs: number } {
  const ordered = orderVideos(videos, sortOrder);

  const covers: string[] = [];
  const coverVideoUrls: string[] = [];
  for (const video of ordered) {
    if (covers.length >= MAX_COVERS) break;
    const url = (video.thumbnailUrl ?? "").trim();
    // An expired signed URL would render as a broken tile — better to skip it and
    // let a later, healthy thumbnail represent the playlist.
    if (!url || hasExpiredSignedUrl(url, now) || covers.includes(url)) continue;
    covers.push(url);
    coverVideoUrls.push(video.videoUrl ?? "");
  }

  const isDone = (v: SummaryVideo) => v.status === "completed";
  const next = ordered.find((v) => !isDone(v));

  return {
    completedCount: ordered.filter(isDone).length,
    covers,
    coverVideoUrls,
    nextVideoId: next ? next.id : null,
    lastWatchedAtMs: ordered.reduce((max, v) => Math.max(max, millis(v.lastWatchedAt)), 0),
  };
}

function signature(s: Comparable | null | undefined, lastMs: number): string {
  if (!s) return "";
  return JSON.stringify([s.completedCount, s.covers, s.coverVideoUrls, s.nextVideoId, lastMs]);
}

/** True when the stored summary differs from a fresh one (or is flagged stale / missing). */
export function summaryNeedsWrite(
  stored: PlaylistSummary | null | undefined,
  stale: boolean | undefined,
  fresh: ReturnType<typeof computePlaylistSummary>,
): boolean {
  if (!stored || stale) return true;
  return signature(stored, millis(stored.lastWatchedAt)) !== signature(fresh, fresh.lastWatchedAtMs);
}

/** Completion 0-100 for the progress bar. */
export function completionPercent(summary: Pick<PlaylistSummary, "completedCount"> | null | undefined, videoCount: number): number {
  if (!summary || !videoCount) return 0;
  return Math.max(0, Math.min(100, Math.round((summary.completedCount / videoCount) * 100)));
}

/** How many decorative "stack" layers sit behind the front card. */
export function stackLayers(videoCount: number): 0 | 1 | 2 {
  if (videoCount >= 3) return 2;
  if (videoCount === 2) return 1;
  return 0;
}
