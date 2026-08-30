import type { FieldValue, Timestamp } from "firebase/firestore";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * DATA MODEL OVERVIEW
 * ─────────────────────────────────────────────────────────────────────────
 * Shared library content (created once, visible to everyone):
 *   playlists/{playlistId}
 *   playlists/{playlistId}/videos/{videoId}   (order + shared metadata)
 *   categories/{categoryId}
 *   tags/{tagId}
 *
 * Personal, per-user state (never duplicates the video itself):
 *   users/{uid}                                        profile + role
 *   users/{uid}/videoStates/{videoId}                  progress, favorite,
 *                                                       watchLater, priority
 *   users/{uid}/notes/{videoId}                         private notes
 *   users/{uid}/summaries/{videoId}                     personal summary
 *   users/{uid}/bookmarks/{videoId}/items/{bookmarkId}   timestamp bookmarks
 *   users/{uid}/favoritePlaylists/{playlistId}
 *   users/{uid}/goals/{goalId}
 *
 * A single global "videos" collection group is intentionally avoided —
 * videos live as a subcollection of the playlist that owns them, which keeps
 * ordering (position) co-located with the shared content and avoids
 * duplicating a video document per student (see README > Data Model).
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Role = "admin" | "student";
export type VideoPlatform = "youtube" | "youtube-shorts" | "facebook" | "vimeo" | "generic";
export type ShareVisibility = "private" | "unlisted" | "public";

export const VIDEO_PLATFORMS: VideoPlatform[] = [
  "youtube",
  "youtube-shorts",
  "facebook",
  "vimeo",
  "generic",
];

export const SHARE_VISIBILITIES: ShareVisibility[] = ["private", "unlisted", "public"];

export interface VideoTag {
  id: string;
  videoId: string;
  tagId: string;
  createdAt: Timestamp | null;
}

export type ShareEntityType = "video" | "playlist";

export type FirestoreTimeValue = Timestamp | FieldValue | null;

export interface ShareRecord {
  id: string;
  ownerUid: string;
  entityType: ShareEntityType;
  entityId: string;
  visibility: ShareVisibility;
  shareToken: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  platform?: VideoPlatform | null;
  creatorName?: string | null;
  videos?: Array<{
    id: string;
    title: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    platform?: VideoPlatform;
  }>;
  revokedAt: FirestoreTimeValue;
  createdAt: FirestoreTimeValue;
  updatedAt: FirestoreTimeValue;
}

export interface PlaylistShare {
  id: string;
  playlistId: string;
  visibility: ShareVisibility;
  shareToken?: string | null;
  createdBy: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface WatchProgress {
  userId: string;
  videoId: string;
  playlistId: string;
  currentSeconds: number;
  percentComplete: number;
  lastWatchedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: Timestamp | null;
  lastActiveAt: Timestamp | null;
  /** Denormalized, cheap-to-read counters updated by client writes at
   *  meaningful events only (not on every keystroke) so the admin table
   *  can render without fanning out reads across every student. */
  stats?: UserStatsSnapshot;
}

export interface UserStatsSnapshot {
  totalVideos: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  favorites: number;
  watchLater: number;
  priority: number;
  totalWatchTimeSeconds: number;
  currentStreakDays: number;
  lastStreakDate: string | null; // yyyy-mm-dd, used to compute streak cheaply
  updatedAt: Timestamp | null;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  createdBy: string;
}

export interface Tag {
  id: string;
  name: string;
  createdBy: string;
}

export type PlaylistVisibility = "shared" | "archived";

export interface Playlist {
  id: string;
  title: string;
  description?: string;
  categoryId?: string | null;
  tagIds?: string[];
  coverThumbnailUrl?: string;
  visibility: PlaylistVisibility;
  videoCount: number;
  source: "manual" | "youtube-import" | "json-import";
  sourceUrl?: string;
  createdBy: string;
  /** Set only on personal playlists (users/{ownerUid}/playlists/...).
   *  Absent/undefined for shared library playlists. */
  ownerUid?: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/** Shared video metadata, stored under playlists/{playlistId}/videos/{videoId}. */
export interface Video {
  id: string;
  playlistId: string;
  title: string;
  videoUrl: string;
  youtubeVideoId?: string | null;
  thumbnailUrl: string;
  durationSeconds?: number;
  creatorName?: string | null;
  platform?: VideoPlatform;
  categoryId?: string | null;
  tagIds?: string[];
  description?: string;
  videoNo?: number | null;
  lessonNo?: number | null;
  partNo?: number | null;
  pageNo?: number | null;
  /** Position within the playlist; drives default ordering + drag/drop reorder. */
  order: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type WatchStatus = "not_started" | "in_progress" | "completed";
export type PriorityLevel = "high" | "medium" | "low" | null;

/** Per-user, per-video personal state. users/{uid}/videoStates/{videoId} */
export interface UserVideoState {
  videoId: string;
  playlistId: string;
  status: WatchStatus;
  watchedPercentage: number; // 0-100
  currentPositionSeconds: number;
  isFavorite: boolean;
  isWatchLater: boolean;
  priority: PriorityLevel;
  /** Manual order used within Watch Later / Priority lists (drag & drop). */
  watchLaterOrder?: number;
  priorityOrder?: number;
  lastWatchedAt: Timestamp | null;
  completedAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface VideoNote {
  videoId: string;
  content: string;
  updatedAt: Timestamp | null;
}

export interface VideoSummary {
  videoId: string;
  content: string;
  updatedAt: Timestamp | null;
}

export interface Bookmark {
  id: string;
  videoId: string;
  timestampSeconds: number;
  label: string;
  createdAt: Timestamp | null;
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PERSONAL PLAYLISTS (student-owned content — the third content tier)
 * ─────────────────────────────────────────────────────────────────────────
 * Unlike the shared library (admin-authored, visible to everyone) or the
 * per-video "state" documents (personal state layered on TOP of shared
 * videos), a personal playlist is content a student creates and owns
 * outright: users/{uid}/personalPlaylists/{playlistId}/videos/{videoId}.
 *
 * It's invisible to every other student and only readable/writable by the
 * owner and admins (see firestore.rules). Because nobody but the owner ever
 * touches it, progress/favorite/watchLater/priority live directly on the
 * video document instead of a separate videoStates collection — there's no
 * "shared metadata vs personal state" split to make here, since it's all
 * personal already.
 * ─────────────────────────────────────────────────────────────────────────
 */
export type PersonalPlaylistVisibility = "private" | "link" | "public";
export type PersonalPlaylistSortMode =
  | "custom"
  | "newest"
  | "oldest"
  | "title-asc"
  | "title-desc"
  | "title-natural"
  | "lesson-part-page"
  | "advanced-keywords"
  | "watched-first"
  | "unwatched-first"
  | "priority"
  | "duration";

export interface PersonalPlaylist {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  visibility: PersonalPlaylistVisibility;
  sortMode?: PersonalPlaylistSortMode;
  sortOrder?: string[];
  /** User-defined keywords for "advanced-keywords" sort mode, in priority
   *  order (e.g. ["Chapter", "Unit"] sorts by Chapter number first, Unit
   *  number as a tiebreaker). Only meaningful when sortMode is
   *  "advanced-keywords"; see src/lib/keywordSort.ts. */
  sortKeywords?: string[];
  videoCount: number;
  totalDurationSeconds?: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PersonalVideo {
  id: string;
  playlistId: string;
  ownerId: string;
  title: string;
  videoUrl: string;
  youtubeVideoId?: string | null;
  thumbnailUrl: string;
  durationSeconds?: number;
  description?: string | null;
  creator?: string | null;
  publishedAt?: string | null;
  platform?: VideoPlatform;
  order: number;
  status: WatchStatus;
  watchedPercentage: number;
  currentPositionSeconds: number;
  isFavorite: boolean;
  isWatchLater: boolean;
  priority: PriorityLevel;
  /** Manual order used within Watch Later / Priority lists (drag & drop), mirrors UserVideoState. */
  watchLaterOrder?: number | null;
  priorityOrder?: number | null;
  lastWatchedAt: Timestamp | null;
  completedAt: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Goal {
  id: string;
  title: string;
  /** Optional free-text detail — "why this matters", success criteria, etc. */
  notes?: string;
  /** ISO date string ("YYYY-MM-DD"), so it sorts/compares as plain text
   *  without needing a Firestore Timestamp for a date-only value the user
   *  picked from a plain <input type="date">. */
  targetDate?: string | null;
  priority?: PriorityLevel;
  completed: boolean;
  completedAt?: Timestamp | null;
  /** Optional link to one of the user's own personal playlists — lets the
   *  Goals page show real watched/total progress instead of a plain
   *  checkbox, e.g. "Finish the ASP.NET Core playlist" tracking itself. The
   *  title is denormalized so the list can render it without an extra
   *  fetch per goal; it's cosmetic only; the id is what's authoritative. */
  linkedPlaylistId?: string | null;
  linkedPlaylistTitle?: string | null;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/** Convenience shape combining shared Video + the current user's state,
 *  used throughout the UI (home grid, lists, video page). */
export interface VideoWithState extends Video {
  state: UserVideoState | null;
  playlistTitle?: string;
  /** Which content tier this video came from — the shared/admin library, or
   *  the signed-in user's own "My Playlists". Cross-cutting personal views
   *  (Watch Later, Favorites, Priority, Continue Watching, Dashboard) merge
   *  both tiers, and this tag tells write-handlers which Firestore path to
   *  update. Undefined is treated as "shared" for backward compatibility. */
  source?: "shared" | "personal";
}

export interface HomeFilters {
  playlistId?: string | null;
  categoryId?: string | null;
  tagId?: string | null;
  platform?: VideoPlatform | null;
  status?: WatchStatus | null;
  favoriteOnly?: boolean;
  watchLaterOnly?: boolean;
  priority?: PriorityLevel;
  query?: string;
}

export type SortOption =
  | "recently-added"
  | "recently-watched"
  | "title-asc"
  | "title-desc"
  | "progress"
  | "duration"
  | "priority"
  | "favorites"
  | "custom-order"
  | "lesson-no"
  | "part-no"
  | "page-no";

export const SORT_LABELS: Record<SortOption, string> = {
  "recently-added": "Recently Added",
  "recently-watched": "Recently Watched",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
  progress: "Progress",
  duration: "Duration",
  priority: "Priority",
  favorites: "Favorites",
  "custom-order": "Custom Order",
  "lesson-no": "Lesson Number",
  "part-no": "Part Number",
  "page-no": "Page Number",
};

export const PRIORITY_ORDER: Record<Exclude<PriorityLevel, null>, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
