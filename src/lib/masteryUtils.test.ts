import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeCategoryMastery, getTopCategoryMastery } from "./masteryUtils";

describe("computeCategoryMastery", () => {
  it("weights recent higher-scoring attempts more heavily without over-weighting stale attempts", () => {
    const attempts = [
      { id: "old-low", categoryId: "math", score: 1, totalQuestions: 5, completedAt: "2024-01-01T00:00:00.000Z" },
      { id: "recent-mid", categoryId: "math", score: 3, totalQuestions: 5, completedAt: "2026-09-10T00:00:00.000Z" },
      { id: "recent-high", categoryId: "math", score: 5, totalQuestions: 5, completedAt: "2026-09-12T00:00:00.000Z" },
    ] as any[];

    const result = computeCategoryMastery(attempts, "math", new Date("2026-09-12T00:00:00.000Z"));
    assert.ok(result >= 0.6 && result <= 0.95);
  });

  it("returns zero when there are no attempts in a category", () => {
    assert.equal(computeCategoryMastery([], "science", new Date("2026-09-12T00:00:00.000Z")), 0);
  });

  it("accepts Firestore Timestamp-like objects with toDate()", () => {
    const attempts = [
      { id: "ts-a", categoryId: "math", score: 4, totalQuestions: 5, completedAt: { toDate: () => new Date("2026-09-10T00:00:00.000Z") } },
      { id: "ts-b", categoryId: "math", score: 5, totalQuestions: 5, completedAt: { toDate: () => new Date("2026-09-12T00:00:00.000Z") } },
    ] as any[];

    const result = computeCategoryMastery(attempts, "math", new Date("2026-09-12T00:00:00.000Z"));
    assert.ok(result > 0);
  });
});

describe("getTopCategoryMastery", () => {
  it("sorts categories by mastery and keeps the strongest ones first", () => {
    const attempts = [
      { id: "a", categoryId: "math", score: 5, totalQuestions: 5, completedAt: "2026-09-12T00:00:00.000Z" },
      { id: "b", categoryId: "math", score: 4, totalQuestions: 5, completedAt: "2026-09-09T00:00:00.000Z" },
      { id: "c", categoryId: "science", score: 2, totalQuestions: 5, completedAt: "2026-09-10T00:00:00.000Z" },
    ] as any[];

    const result = getTopCategoryMastery(attempts, [
      { id: "math", name: "Math" },
      { id: "science", name: "Science" },
      { id: "history", name: "History" },
    ], new Date("2026-09-12T00:00:00.000Z"), 2);

    assert.equal(result[0]?.categoryId, "math");
    assert.equal(result[1]?.categoryId, "science");
    assert.equal(result.length, 2);
  });
});
