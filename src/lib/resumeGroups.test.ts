import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildResumeGroups, summarizeResume } from "./resumeGroups";

const ts = (ms: number) => ({ toMillis: () => ms });
const v = (id: string, playlistId: string | null, ms: number, title = "P") => ({ id, playlistId, playlistTitle: playlistId ? `${title}-${playlistId}` : null, state: { lastWatchedAt: ts(ms) } });

describe("buildResumeGroups", () => {
  it("creates ONE group per playlist, most recent first, with the newest video as `latest`", () => {
    const groups = buildResumeGroups([v("a1", "A", 900), v("b1", "B", 800), v("a2", "A", 700), v("c1", "C", 100)]);
    assert.deepEqual(groups.map((g) => g.key), ["A", "B", "C"]);
    assert.equal(groups[0].latest.id, "a1");
    assert.deepEqual(groups[0].videos.map((x) => x.id), ["a1", "a2"]);
    assert.equal(groups[0].lastWatchedMs, 900);
  });

  it("re-orders groups by recency even if the caller passed them unsorted", () => {
    const groups = buildResumeGroups([v("a1", "A", 100), v("b1", "B", 900)]);
    assert.deepEqual(groups.map((g) => g.key), ["B", "A"]);
  });

  it("collects playlist-less videos into a trailing 'Other' group", () => {
    const groups = buildResumeGroups([v("x", null, 500), v("a1", "A", 400)]);
    assert.ok(groups.some((g) => g.key === "other" && g.title === "Other"));
  });

  it("returns nothing for an empty queue and summarises counts", () => {
    assert.deepEqual(buildResumeGroups([]), []);
    const groups = buildResumeGroups([v("a1", "A", 3), v("a2", "A", 2), v("b1", "B", 1)]);
    assert.deepEqual(summarizeResume(groups), { videos: 3, playlists: 2 });
  });
});
