import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isExpiredOrExpiringSoon } from "./signedThumbnailUrl";
import { chunk, needsThumbnailRefresh, pickHealTargets } from "./thumbnailHealing";

const NOW = new Date("2026-09-20T00:00:00.000Z");
// oe=6A9CD537 -> 2026-09-06 (expired relative to NOW). oe=6AB4D1C0 -> well in the future.
const EXPIRED = "https://scontent.xx.fbcdn.net/a.jpg?oh=sig&oe=6A9CD537";
const FUTURE_SECONDS = Math.floor(new Date("2026-12-01T00:00:00.000Z").getTime() / 1000).toString(16).toUpperCase();
const HEALTHY = `https://scontent.xx.fbcdn.net/b.jpg?oh=sig&oe=${FUTURE_SECONDS}`;
const SOON_SECONDS = Math.floor((NOW.getTime() + 24 * 3600 * 1000) / 1000).toString(16).toUpperCase();
const EXPIRING_SOON = `https://scontent.xx.fbcdn.net/c.jpg?oh=sig&oe=${SOON_SECONDS}`;

const FB = "https://www.facebook.com/watch/?v=1234567890";
const FB2 = "https://www.facebook.com/reel/9876543210/";
const YT = "https://www.youtube.com/watch?v=abcdefghijk";

describe("isExpiredOrExpiringSoon", () => {
  it("flags expired, expiring-within-window, and not healthy ones", () => {
    assert.equal(isExpiredOrExpiringSoon(EXPIRED, NOW), true);
    assert.equal(isExpiredOrExpiringSoon(EXPIRING_SOON, NOW), true);
    assert.equal(isExpiredOrExpiringSoon(HEALTHY, NOW), false);
  });
  it("ignores URLs with no expiry (YouTube)", () => {
    assert.equal(isExpiredOrExpiringSoon("https://i.ytimg.com/vi/x/hq.jpg", NOW), false);
  });
});

describe("needsThumbnailRefresh", () => {
  it("refreshes Facebook videos with missing, expired or soon-expiring thumbnails", () => {
    assert.equal(needsThumbnailRefresh({ videoUrl: FB, thumbnailUrl: "" }, NOW), true);
    assert.equal(needsThumbnailRefresh({ videoUrl: FB, thumbnailUrl: null }, NOW), true);
    assert.equal(needsThumbnailRefresh({ videoUrl: FB, thumbnailUrl: EXPIRED }, NOW), true);
    assert.equal(needsThumbnailRefresh({ videoUrl: FB, thumbnailUrl: EXPIRING_SOON }, NOW), true);
  });
  it("leaves healthy Facebook thumbnails alone", () => {
    assert.equal(needsThumbnailRefresh({ videoUrl: FB, thumbnailUrl: HEALTHY }, NOW), false);
  });
  it("never touches non-Facebook videos, even with a missing thumbnail", () => {
    assert.equal(needsThumbnailRefresh({ videoUrl: YT, thumbnailUrl: "" }, NOW), false);
    assert.equal(needsThumbnailRefresh({ videoUrl: "", thumbnailUrl: "" }, NOW), false);
  });
});

describe("pickHealTargets", () => {
  it("returns unique URLs that need healing", () => {
    const targets = pickHealTargets(
      [
        { videoUrl: FB, thumbnailUrl: EXPIRED },
        { videoUrl: FB, thumbnailUrl: EXPIRED }, // duplicate URL in two playlists
        { videoUrl: FB2, thumbnailUrl: HEALTHY },
        { videoUrl: YT, thumbnailUrl: "" },
      ],
      { now: NOW },
    );
    assert.deepEqual(targets, [FB]);
  });
  it("skips URLs tried recently (no retry loops)", () => {
    const targets = pickHealTargets([{ videoUrl: FB, thumbnailUrl: EXPIRED }], { now: NOW, recentlyTried: () => true });
    assert.deepEqual(targets, []);
  });
  it("caps how many are healed per visit", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ videoUrl: `https://www.facebook.com/watch/?v=${1000000 + i}`, thumbnailUrl: "" }));
    assert.equal(pickHealTargets(many, { now: NOW, limit: 30 }).length, 30);
  });
});

describe("chunk", () => {
  it("splits into batches", () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunk([], 3), []);
  });
});
