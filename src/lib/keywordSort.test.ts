import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compareByKeywords, parseKeywordInput, parseKeywordNumbers } from "./keywordSort";

describe("parseKeywordInput", () => {
  it("splits, trims, and de-duplicates comma-separated keywords", () => {
    assert.deepEqual(parseKeywordInput("Chapter,  Unit ,Page"), ["Chapter", "Unit", "Page"]);
    assert.deepEqual(parseKeywordInput("chapter, Chapter, CHAPTER"), ["chapter"]);
    assert.deepEqual(parseKeywordInput(" , , "), []);
  });
});

describe("parseKeywordNumbers", () => {
  it("extracts a number after each keyword, tolerating messy separators", () => {
    assert.deepEqual(
      parseKeywordNumbers("Chapter 3 - Unit   14 | Intro to Algebra", ["Chapter", "Unit", "Page"]),
      [3, 14, null]
    );
    assert.deepEqual(
      parseKeywordNumbers("Set - 2 | Sheet 10", ["Set", "Sheet"]),
      [2, 10]
    );
  });
});

describe("compareByKeywords", () => {
  it("sorts by the first keyword, then the second as a tiebreaker", () => {
    const titles = [
      "Module 4 | Week 2 | Recap",
      "Module 2 | Week 1 | Intro",
      "Module 4 | Week 1 | Kickoff",
      "Module 2 | Week 3 | Wrap-up",
      "Just a one-off video with no module number",
    ];

    const sorted = [...titles].sort((a, b) => compareByKeywords(a, b, ["Module", "Week"]));

    assert.deepEqual(sorted, [
      "Module 2 | Week 1 | Intro",
      "Module 2 | Week 3 | Wrap-up",
      "Module 4 | Week 1 | Kickoff",
      "Module 4 | Week 2 | Recap",
      "Just a one-off video with no module number",
    ]);
  });

  it("falls back to natural title order when no keywords are given", () => {
    assert.equal(compareByKeywords("Video 2", "Video 10", []) < 0, true);
  });
});
