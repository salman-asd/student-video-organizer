import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDueReviews } from "./reviewUtils";

const NOW = new Date("2026-09-14T12:00:00Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

describe("getDueReviews", () => {
  it("queues a low-score quiz after three days", () => {
    const due = getDueReviews([{ videoId: "video-1", score: 2, totalQuestions: 5, completedAt: daysAgo(3) }], NOW);
    assert.deepEqual(due, [{ videoId: "video-1", scorePercent: 40, ageDays: 3 }]);
  });

  it("waits seven days before repeating a strong result", () => {
    assert.equal(getDueReviews([{ videoId: "video-1", score: 5, totalQuestions: 5, completedAt: daysAgo(6) }], NOW).length, 0);
    assert.equal(getDueReviews([{ videoId: "video-1", score: 5, totalQuestions: 5, completedAt: daysAgo(7) }], NOW).length, 1);
  });

  it("ignores malformed or incomplete attempts", () => {
    assert.deepEqual(getDueReviews([
      { videoId: "", score: 1, totalQuestions: 2, completedAt: daysAgo(10) },
      { videoId: "video-2", score: 1, totalQuestions: 0, completedAt: daysAgo(10) },
      { videoId: "video-3", score: 1, totalQuestions: 2 },
    ], NOW), []);
  });
});
