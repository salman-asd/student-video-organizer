import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInterestSuggestion, hasCompletedInterestSelection, normalizeUserInterests, setUserInterestLevel } from "./userInterests";

describe("hasCompletedInterestSelection", () => {
  it("treats an empty or missing interest list as not yet onboarded", () => {
    assert.equal(hasCompletedInterestSelection(null), false);
    assert.equal(hasCompletedInterestSelection({ interests: [] }), false);
  });

  it("recognizes a saved selection as completed onboarding", () => {
    assert.equal(hasCompletedInterestSelection({ interests: [{ categoryId: "cat-1", level: null }] }), true);
  });
});

describe("normalizeUserInterests", () => {
  it("trims, deduplicates, and preserves valid entries", () => {
    const result = normalizeUserInterests([
      { categoryId: "  cat-1  ", level: null },
      { categoryId: "cat-1", level: "basic" },
      { categoryId: "cat-2", level: null },
      { categoryId: "", level: null },
    ]);

    assert.deepEqual(result, [
      { categoryId: "cat-1", level: null },
      { categoryId: "cat-2", level: null },
    ]);
  });
});

describe("buildInterestSuggestion", () => {
  it("returns the exact existing category match when the user typed a known category name", () => {
    const result = buildInterestSuggestion("Programming", [
      { id: "cat-1", name: "Programming" },
      { id: "cat-2", name: "Design" },
    ]);

    assert.deepEqual(result, {
      cleanedName: "Programming",
      matchingCategoryId: "cat-1",
      matchingCategoryName: "Programming",
      isDuplicate: true,
    });
  });

  it("normalizes a likely typo into the closest saved category without changing the original user input", () => {
    const result = buildInterestSuggestion("progamming", [
      { id: "cat-1", name: "Programming" },
      { id: "cat-2", name: "Math" },
    ]);

    assert.equal(result.cleanedName, "Programming");
    assert.equal(result.matchingCategoryId, "cat-1");
    assert.equal(result.matchingCategoryName, "Programming");
    assert.equal(result.isDuplicate, true);
  });
});

describe("setUserInterestLevel", () => {
  it("updates the level for an existing interest without duplicating it", () => {
    const result = setUserInterestLevel([
      { categoryId: "cat-1", level: null },
      { categoryId: "cat-2", level: "basic" },
    ], "cat-1", "advanced");

    assert.deepEqual(result, [
      { categoryId: "cat-1", level: "advanced" },
      { categoryId: "cat-2", level: "basic" },
    ]);
  });
});
