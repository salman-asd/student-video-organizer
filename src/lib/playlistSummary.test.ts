import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { completionPercent, computePlaylistSummary, orderVideos, stackLayers, summaryNeedsWrite } from "./playlistSummary";

const NOW = new Date("2026-09-20T00:00:00.000Z");
const EXPIRED = "https://scontent.xx.fbcdn.net/a.jpg?oh=s&oe=6A9CD537";
const v = (id: string, extra: object = {}) => ({ id, videoUrl: `https://y/${id}`, thumbnailUrl: `https://i/${id}.jpg`, status: "not_started", order: 0, ...extra });

describe("orderVideos", () => {
  it("uses custom sortOrder first, then the order field", () => {
    const list = [v("a", { order: 2 }), v("b", { order: 1 }), v("c", { order: 3 })];
    assert.deepEqual(orderVideos(list, ["c"]).map((x) => x.id), ["c", "b", "a"]);
    assert.deepEqual(orderVideos(list).map((x) => x.id), ["b", "a", "c"]);
  });
});

describe("computePlaylistSummary", () => {
  it("counts completed and finds the first unwatched video in playlist order", () => {
    const s = computePlaylistSummary([v("a", { order: 1, status: "completed" }), v("b", { order: 2 }), v("c", { order: 3 })], [], NOW);
    assert.equal(s.completedCount, 1);
    assert.equal(s.nextVideoId, "b");
  });
  it("nextVideoId is null when everything is watched or the playlist is empty", () => {
    assert.equal(computePlaylistSummary([v("a", { status: "completed" })], [], NOW).nextVideoId, null);
    assert.equal(computePlaylistSummary([], [], NOW).nextVideoId, null);
  });
  it("picks up to 3 distinct, non-expired covers and keeps video urls parallel", () => {
    const list = [
      v("a", { order: 1, thumbnailUrl: EXPIRED }),
      v("b", { order: 2 }),
      v("c", { order: 3, thumbnailUrl: "https://i/b.jpg" }), // duplicate URL
      v("d", { order: 4 }), v("e", { order: 5 }), v("f", { order: 6 }),
    ];
    const s = computePlaylistSummary(list, [], NOW);
    assert.deepEqual(s.covers, ["https://i/b.jpg", "https://i/d.jpg", "https://i/e.jpg"]);
    assert.deepEqual(s.coverVideoUrls, ["https://y/b", "https://y/d", "https://y/e"]);
  });
  it("has no covers when every thumbnail is missing or expired", () => {
    assert.deepEqual(computePlaylistSummary([v("a", { thumbnailUrl: "" }), v("b", { thumbnailUrl: EXPIRED })], [], NOW).covers, []);
  });
  it("reports the latest lastWatchedAt", () => {
    const s = computePlaylistSummary([v("a", { lastWatchedAt: new Date(1000) }), v("b", { lastWatchedAt: new Date(5000) })], [], NOW);
    assert.equal(s.lastWatchedAtMs, 5000);
  });
});

describe("summaryNeedsWrite", () => {
  const fresh = computePlaylistSummary([v("a")], [], NOW);
  const stored = { completedCount: fresh.completedCount, covers: fresh.covers, coverVideoUrls: fresh.coverVideoUrls, nextVideoId: fresh.nextVideoId, lastWatchedAt: null };
  it("writes when missing or flagged stale", () => {
    assert.equal(summaryNeedsWrite(null, false, fresh), true);
    assert.equal(summaryNeedsWrite(stored, true, fresh), true);
  });
  it("does not write when nothing changed (prevents write loops)", () => {
    assert.equal(summaryNeedsWrite(stored, false, fresh), false);
  });
  it("writes when content changed", () => {
    assert.equal(summaryNeedsWrite({ ...stored, completedCount: 3 }, false, fresh), true);
  });
});

describe("completionPercent / stackLayers", () => {
  it("computes and clamps", () => {
    assert.equal(completionPercent({ completedCount: 3 }, 12), 25);
    assert.equal(completionPercent({ completedCount: 20 }, 12), 100);
    assert.equal(completionPercent(null, 12), 0);
    assert.equal(completionPercent({ completedCount: 1 }, 0), 0);
  });
  it("layers follow video count", () => {
    assert.deepEqual([0, 1, 2, 3, 9].map(stackLayers), [0, 0, 1, 2, 2]);
  });
});
