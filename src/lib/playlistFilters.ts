import type { PersonalPlaylist } from "@/types";

export type PersonalPlaylistSort = "recently-added" | "recently-updated" | "title-asc" | "title-desc" | "most-videos" | "fewest-videos";
export type PersonalPlaylistVisibilityFilter = "all" | "private" | "link" | "public";

export interface PersonalPlaylistFilters {
  query: string;
  categoryId: string;
  tagIds: string[];
  visibility: PersonalPlaylistVisibilityFilter;
  sort: PersonalPlaylistSort;
}

function timestampValue(value: PersonalPlaylist["createdAt"] | PersonalPlaylist["updatedAt"]): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

export function filterAndSortPersonalPlaylists(playlists: PersonalPlaylist[], filters: PersonalPlaylistFilters): PersonalPlaylist[] {
  const query = filters.query.trim().toLowerCase();
  const filtered = playlists.filter((playlist) => {
    const matchesQuery = !query || `${playlist.title} ${playlist.description || ""}`.toLowerCase().includes(query);
    const matchesCategory = filters.categoryId === "all" || playlist.categoryId === filters.categoryId;
    const matchesTags = filters.tagIds.length === 0 || filters.tagIds.every((tagId) => (playlist.tagIds || []).includes(tagId));
    const matchesVisibility = filters.visibility === "all" || playlist.visibility === filters.visibility;
    return matchesQuery && matchesCategory && matchesTags && matchesVisibility;
  });

  return filtered.sort((left, right) => {
    const unsortedComparison = Number(!!right.isUnsorted) - Number(!!left.isUnsorted);
    if (filters.sort === "title-asc" || filters.sort === "title-desc") {
      const comparison = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      return comparison === 0 ? unsortedComparison : (filters.sort === "title-asc" ? comparison : -comparison);
    }
    if (filters.sort === "most-videos" || filters.sort === "fewest-videos") {
      const comparison = (left.videoCount || 0) - (right.videoCount || 0);
      return comparison === 0 ? unsortedComparison : (filters.sort === "most-videos" ? -comparison : comparison);
    }
    const leftValue = timestampValue(filters.sort === "recently-added" ? left.createdAt : left.updatedAt);
    const rightValue = timestampValue(filters.sort === "recently-added" ? right.createdAt : right.updatedAt);
    return rightValue === leftValue ? unsortedComparison : rightValue - leftValue;
  });
}