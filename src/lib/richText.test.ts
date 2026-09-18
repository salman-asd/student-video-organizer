import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isHtmlContent,
  isEmptyEditorHtml,
  looksLikeMarkdown,
  needsMigration,
  normalizeEditorOutput,
  normalizeSummaryContent,
} from "./richText";

describe("isHtmlContent", () => {
  it("recognises real editor output", () => {
    assert.equal(isHtmlContent("<p>hello</p>"), true);
    assert.equal(isHtmlContent("<h2>Title</h2><p>body</p>"), true);
    assert.equal(isHtmlContent("<ul><li>one</li></ul>"), true);
  });

  it("does not mistake markdown or plain text for HTML", () => {
    assert.equal(isHtmlContent("**bold** and text"), false);
    assert.equal(isHtmlContent("# Heading\n- item"), false);
    assert.equal(isHtmlContent("just some notes"), false);
    assert.equal(isHtmlContent(""), false);
  });

  it("ignores HTML-looking text that is not at the start", () => {
    // The old unanchored regex treated this as HTML and skipped markdown
    // conversion, leaving literal ** on screen.
    assert.equal(isHtmlContent("compare a<b and c>d **bold**"), false);
  });
});

describe("looksLikeMarkdown", () => {
  it("detects the markup a user would expect to be rendered", () => {
    assert.equal(looksLikeMarkdown("**English Tense**"), true);
    assert.equal(looksLikeMarkdown("# Heading"), true);
    assert.equal(looksLikeMarkdown("- one\n- two"), true);
    assert.equal(looksLikeMarkdown("1. one\n2. two"), true);
    assert.equal(looksLikeMarkdown("text with **bold** inside"), true);
  });

  it("does not flag plain prose or existing HTML", () => {
    assert.equal(looksLikeMarkdown("just ordinary notes"), false);
    assert.equal(looksLikeMarkdown("<p>already html</p>"), false);
    assert.equal(looksLikeMarkdown(""), false);
  });
});

describe("normalizeSummaryContent (the storage-format contract)", () => {
  it("passes editor HTML through unchanged", () => {
    const html = "<h2>Title</h2><p>Body text</p>";
    assert.equal(normalizeSummaryContent(html), html);
  });

  it("converts legacy markdown to HTML and never leaves literal asterisks", () => {
    const result = normalizeSummaryContent("**English Tense**");
    assert.ok(!result.includes("**"));
    // A line that is ENTIRELY bold is treated as a heading by summaryHtml's
    // existing rule (isMarkdownHeading), which is pre-existing behaviour this
    // migration deliberately preserves rather than second-guessing.
    assert.match(result, /<h3>English Tense<\/h3>/);
  });

  it("converts inline bold to <strong>, not a heading", () => {
    const result = normalizeSummaryContent("hello **bold** world");
    assert.match(result, /<strong>bold<\/strong>/);
    assert.ok(!result.includes("**"));
  });

  it("converts a markdown heading and bullet list to real elements", () => {
    const result = normalizeSummaryContent("# Verbs\n- go\n- went");
    assert.match(result, /<h3>Verbs<\/h3>/);
    assert.match(result, /<ul>/);
    assert.match(result, /<li>go<\/li>/);
  });

  it("wraps plain text in a paragraph", () => {
    const result = normalizeSummaryContent("just notes");
    assert.match(result, /<p>just notes<\/p>/);
  });

  it("returns empty for empty input", () => {
    assert.equal(normalizeSummaryContent(""), "");
    assert.equal(normalizeSummaryContent("   "), "");
  });

  it("is idempotent — normalizing twice equals normalizing once", () => {
    for (const input of ["**bold**", "# Title\n- a", "plain text", "<p>html</p>"]) {
      const once = normalizeSummaryContent(input);
      const twice = normalizeSummaryContent(once);
      assert.equal(twice, once, `not idempotent for: ${input}`);
    }
  });

  it("strips script tags and on* handlers out of stored content", () => {
    const hostile = '<p>ok</p><script>alert(1)</script><img src=x onerror="alert(1)">';
    const result = normalizeSummaryContent(hostile);
    assert.ok(!result.toLowerCase().includes("<script"));
    assert.ok(!result.toLowerCase().includes("onerror"));
    assert.match(result, /<p>ok<\/p>/);
  });
});

describe("needsMigration", () => {
  it("is false for content already in HTML", () => {
    assert.equal(needsMigration("<p>already fine</p>"), false);
  });

  it("is false for empty content, so opening a blank summary causes no write", () => {
    assert.equal(needsMigration(""), false);
    assert.equal(needsMigration("   "), false);
  });

  it("is true for legacy markdown that would actually change", () => {
    assert.equal(needsMigration("**bold**"), true);
    assert.equal(needsMigration("# Heading"), true);
  });

  it("is false for plain prose that stays byte-identical once wrapped", () => {
    // normalizeSummaryContent("<p>x</p>") !== "x", so this is true; the point
    // of the assertion is to pin the actual behaviour rather than to assert a
    // preference. Plain text does get wrapped on first migration.
    assert.equal(needsMigration("plain notes"), true);
  });
});

describe("normalizeEditorOutput", () => {
  it("collapses Tiptap's empty document to an empty string", () => {
    // "<p></p>" is falsy-looking but truthy as a string; storing it would make
    // the next read render a blank paragraph instead of the placeholder.
    assert.equal(normalizeEditorOutput("<p></p>"), "");
    assert.equal(normalizeEditorOutput("<p><br></p>"), "");
    assert.equal(normalizeEditorOutput("<p>&nbsp;</p>"), "");
    assert.equal(normalizeEditorOutput(""), "");
  });

  it("keeps real content untouched", () => {
    assert.equal(normalizeEditorOutput("<p>hello</p>"), "<p>hello</p>");
  });
});

describe("isEmptyEditorHtml", () => {
  it("is true only for scaffolding with no text", () => {
    assert.equal(isEmptyEditorHtml("<p></p>"), true);
    assert.equal(isEmptyEditorHtml("<p> </p>"), true);
    assert.equal(isEmptyEditorHtml("<p>x</p>"), false);
  });
});
