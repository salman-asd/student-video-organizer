import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toSummaryHtml } from "./summaryHtml";

describe("toSummaryHtml", () => {
  it("wraps plain text as paragraphs without breaking existing HTML", () => {
    assert.equal(toSummaryHtml("First line\n\nSecond line"), "<p>First line</p><p>Second line</p>");
    assert.equal(toSummaryHtml("<h2>Heading</h2><p>Body</p>"), "<h2>Heading</h2><p>Body</p>");
  });

  it("converts markdown headings and lists into HTML", () => {
    const result = toSummaryHtml([
      "**Topics**",
      "- Present simple tense",
      "- Negative sentence structure",
      "- Subject-verb agreement (Do/Does)",
    ].join("\n"));

    assert.equal(result, [
      "<h3>Topics</h3>",
      "<ul><li>Present simple tense</li><li>Negative sentence structure</li><li>Subject-verb agreement (Do/Does)</li></ul>",
    ].join(""));
  });

  it("treats empty content as empty HTML", () => {
    assert.equal(toSummaryHtml("   \n\n  "), "");
  });
});
