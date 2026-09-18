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

  it("removes unsafe tags and attributes from stored HTML", () => {
    assert.equal(
      toSummaryHtml('<p onclick="alert(1)">Safe</p><script>alert(2)</script><img src="x">'),
      "<p>Safe</p>",
    );
  });

  it("still converts markdown when the plain text happens to contain '<' and '>' (e.g. comparisons or HTML mentions)", () => {
    // Regression test: the previous detector (/<\/?[a-z][\s\S]*>/i, unanchored)
    // matched a "<" and a later ">" *anywhere* in the string, so ordinary
    // markdown mentioning something like "a<b" or "<div>" mid-sentence was
    // misidentified as already-rendered HTML and never converted — leaving
    // literal **bold**/- lists on screen instead of rendering them.
    assert.equal(
      toSummaryHtml("**English Tense**\n- Compare a<b to b>a in this lesson"),
      "<h3>English Tense</h3><ul><li>Compare a&lt;b to b&gt;a in this lesson</li></ul>",
    );
    assert.equal(
      toSummaryHtml("**HTML Basics**\nA <div> element groups content."),
      "<h3>HTML Basics</h3><p>A &lt;div&gt; element groups content.</p>",
    );
  });
});
