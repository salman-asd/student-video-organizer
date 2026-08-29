import type { HomeFilters, SortOption, VideoWithState } from "@/types";
import { PRIORITY_ORDER } from "@/types";

export function applyFilters(videos: VideoWithState[], filters: HomeFilters): VideoWithState[] {
  return videos.filter((v) => {
    if (filters.playlistId && v.playlistId !== filters.playlistId) return false;
    if (filters.categoryId && v.categoryId !== filters.categoryId) return false;
    if (filters.tagId && !(v.tagIds || []).includes(filters.tagId)) return false;
    if (filters.platform) {
      const platform = v.platform || "generic";
      if (platform !== filters.platform) return false;
    }
    if (filters.status && (v.state?.status || "not_started") !== filters.status) return false;
    if (filters.favoriteOnly && !v.state?.isFavorite) return false;
    if (filters.watchLaterOnly && !v.state?.isWatchLater) return false;
    if (filters.priority && v.state?.priority !== filters.priority) return false;
    if (filters.query) {
      const q = filters.query.toLowerCase();
      const haystack = `${v.title} ${v.creatorName || ""} ${v.playlistTitle || ""} ${(v.tagIds || []).join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return 0;
}

export function applySort(videos: VideoWithState[], sort: SortOption): VideoWithState[] {
  const copy = [...videos];
  switch (sort) {
    case "recently-added":
      return copy.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
    case "recently-watched":
      return copy.sort((a, b) => tsMillis(b.state?.lastWatchedAt) - tsMillis(a.state?.lastWatchedAt));
    case "title-asc":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case "title-desc":
      return copy.sort((a, b) => b.title.localeCompare(a.title));
    case "progress":
      return copy.sort((a, b) => (b.state?.watchedPercentage || 0) - (a.state?.watchedPercentage || 0));
    case "duration":
      return copy.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
    case "priority":
      return copy.sort((a, b) => {
        const pa = a.state?.priority ? PRIORITY_ORDER[a.state.priority] : 3;
        const pb = b.state?.priority ? PRIORITY_ORDER[b.state.priority] : 3;
        return pa - pb;
      });
    case "favorites":
      return copy.sort((a, b) => Number(!!b.state?.isFavorite) - Number(!!a.state?.isFavorite));
    case "custom-order":
      return copy.sort((a, b) => a.order - b.order);
    case "lesson-no":
      return copy.sort((a, b) => (a.lessonNo ?? 999999) - (b.lessonNo ?? 999999));
    case "part-no":
      return copy.sort((a, b) => (a.partNo ?? 999999) - (b.partNo ?? 999999));
    case "page-no":
      return copy.sort((a, b) => (a.pageNo ?? 999999) - (b.pageNo ?? 999999));
    default:
      return copy;
  }
}
