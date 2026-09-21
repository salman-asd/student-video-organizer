import { groupVideosByPlaylist } from "@/lib/groupByPlaylist";

/**
 * View-model for the Continue Learning page.
 *
 * Input is the resume queue ALREADY sorted most-recently-watched first; each playlist becomes ONE
 * group whose `latest` video is what "Continue" resumes. Kept pure so the grouping/ordering rules
 * (and the "Other" bucket) are testable without React or Firestore.
 */

export interface ResumeVideoLike {
  id: string;
  playlistId?: string | null;
  playlistTitle?: string | null;
  state?: { lastWatchedAt?: unknown } | null;
}

export interface ResumeGroup<T extends ResumeVideoLike> {
  /** Stable key; "other" for videos without a playlist. */
  key: string;
  playlistId: string | null;
  title: string;
  videos: T[];
  /** Most recently watched video in the group — the one "Continue" resumes. */
  latest: T;
  lastWatchedMs: number;
}

export function timestampMillis(value: unknown): number {
  const v = value as { toMillis?: () => number } | null | undefined;
  return v && typeof v.toMillis === "function" ? v.toMillis() : 0;
}

export function buildResumeGroups<T extends ResumeVideoLike>(sortedVideos: T[]): ResumeGroup<T>[] {
  return groupVideosByPlaylist(sortedVideos)
    .filter((group) => group.videos.length > 0)
    .map((group) => ({
      key: group.playlistId ?? "other",
      playlistId: group.playlistId,
      title: group.playlistTitle,
      videos: group.videos,
      latest: group.videos[0],
      lastWatchedMs: timestampMillis(group.videos[0].state?.lastWatchedAt),
    }))
    // Groups can only be out of order if the caller passed an unsorted list; make the page's promise
    // ("most recently watched first") true regardless.
    .sort((a, b) => b.lastWatchedMs - a.lastWatchedMs);
}

export function summarizeResume(groups: ResumeGroup<ResumeVideoLike>[]): { videos: number; playlists: number } {
  return { videos: groups.reduce((sum, g) => sum + g.videos.length, 0), playlists: groups.length };
}
