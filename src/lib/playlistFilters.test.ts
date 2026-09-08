import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PersonalPlaylist } from "@/types";
import { filterAndSortPersonalPlaylists } from "./playlistFilters";

const playlists = [
  { id: "1", title: "React Basics", description: "Frontend lessons", categoryId: "web", tagIds: ["beginner", "frontend"], visibility: "private", videoCount: 3 },
  { id: "2", title: "SQL Practice", description: "Database drills", categoryId: "data", tagIds: ["practice"], visibility: "public", videoCount: 8 },
  { id: "3", title: "Untitled Collection", description: "", categoryId: null, tagIds: [], visibility: "link", videoCount: 0 },
] as PersonalPlaylist[];

const base = { query: "", categoryId: "all", tagIds: [], visibility: "all" as const, sort: "title-asc" as const };

describe("filterAndSortPersonalPlaylists", () => {
  it("combines search, category, tag, and visibility filters", () => {
    const result = filterAndSortPersonalPlaylists(playlists, { ...base, query: "frontend", categoryId: "web", tagIds: ["beginner"], visibility: "private" });
    assert.deepEqual(result.map((playlist) => playlist.id), ["1"]);
  });

  it("sorts by video count and handles playlists without metadata", () => {
    assert.deepEqual(filterAndSortPersonalPlaylists(playlists, { ...base, sort: "most-videos" }).map((playlist) => playlist.id), ["2", "1", "3"]);
    assert.deepEqual(filterAndSortPersonalPlaylists(playlists, { ...base, sort: "fewest-videos" }).map((playlist) => playlist.id), ["3", "1", "2"]);
  });
});