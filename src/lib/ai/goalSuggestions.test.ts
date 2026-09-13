import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGoalSuggestionsFromText } from "./aiService";

describe("parseGoalSuggestionsFromText", () => {
  it("parses a valid JSON goal-suggestion response with the expected shape", () => {
    const result = parseGoalSuggestionsFromText([
      "```json",
      "[",
      "  { \"title\": \"Finish the fundamentals\", \"notes\": \"Cover the basics end to end.\", \"daysFromNow\": 7 },",
      "  { \"title\": \"Build a small project\", \"notes\": \"Apply what you learned.\", \"daysFromNow\": 21 }",
      "]",
      "```",
    ].join("\n"));

    assert.deepEqual(result, [
      { title: "Finish the fundamentals", notes: "Cover the basics end to end.", daysFromNow: 7 },
      { title: "Build a small project", notes: "Apply what you learned.", daysFromNow: 21 },
    ]);
  });

  it("caps at 4 suggestions even if the model returns more", () => {
    const raw = JSON.stringify(
      Array.from({ length: 6 }, (_, i) => ({ title: `Goal ${i + 1}`, notes: "", daysFromNow: i + 1 }))
    );
    const result = parseGoalSuggestionsFromText(raw);
    assert.equal(result.length, 4);
  });

  it("rejects malformed JSON, a non-array root, or entries missing a title/daysFromNow", () => {
    assert.throws(() => parseGoalSuggestionsFromText("not-json"), /Invalid goal suggestion response/);
    assert.throws(() => parseGoalSuggestionsFromText(JSON.stringify({ title: "not an array" })), /Invalid goal suggestion response/);
    assert.throws(() => parseGoalSuggestionsFromText(JSON.stringify([{ notes: "no title" }])), /Invalid goal suggestion response/);
    assert.throws(() => parseGoalSuggestionsFromText(JSON.stringify([{ title: "no days" }])), /Invalid goal suggestion response/);
    assert.throws(() => parseGoalSuggestionsFromText(JSON.stringify([])), /Invalid goal suggestion response/);
  });
});
