export function toSummaryHtml(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (looksLikeHtml(raw)) {
    return sanitizeSummaryHtml(raw);
  }

  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return blocks.map(renderBlock).join("");
}

// Detects genuine, already-rendered HTML (from Tiptap's own getHTML(), or
// from a previous run through this same function) so it isn't re-run
// through markdown conversion. Every value this app ever produces starts
// with a real block-level tag (<p>, <h1-6>, <ul>, <ol>, <blockquote>), so
// anchoring to the start of the string is both sufficient and necessary:
// the previous unanchored /<\/?[a-z][\s\S]*>/i check matched a "<" and a
// later ">" ANYWHERE in the string, so plain markdown text that merely
// mentioned something like "a<b" or "<div>" mid-sentence (comparisons,
// code, HTML examples) was misidentified as pre-rendered HTML and skipped
// markdown conversion entirely — leaving literal **bold**/- lists/# headings
// on screen instead of rendering them.
function looksLikeHtml(value: string): boolean {
  return /^<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(value);
}

function sanitizeSummaryHtml(value: string): string {
  const withoutDangerousBlocks = value.replace(/<(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const allowedTags = /<\/?(p|h[1-6]|ul|ol|li|strong|em|blockquote|br)\b[^>]*>/gi;
  const normalizedAllowedTags = withoutDangerousBlocks.replace(allowedTags, (tag: string, name: string) => {
    const closing = tag.startsWith("</") ? "/" : "";
    return `<${closing}${name.toLowerCase()}>`;
  });
  return normalizedAllowedTags.replace(/<(?!\/?(p|h[1-6]|ul|ol|li|strong|em|blockquote|br)\b)[^>]*>/gi, "");
}

function renderBlock(block: string): string {
  const lines = block.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";

  const heading = isMarkdownHeading(lines[0]) ? stripMarkdownHeading(lines[0]) : null;
  const contentLines = heading ? lines.slice(1) : lines;
  const listItems = contentLines.filter(isMarkdownListItem).map(stripMarkdownListMarker);
  const nonListLines = contentLines.filter((line) => !isMarkdownListItem(line));

  const sections: string[] = [];

  if (heading) {
    sections.push(`<h3>${markdownInlineToHtml(heading)}</h3>`);
  }

  if (listItems.length > 0) {
    sections.push(`<ul>${listItems.map((item) => `<li>${markdownInlineToHtml(item)}</li>`).join("")}</ul>`);
  }

  // Blockquotes: consecutive "&gt; " lines become one <blockquote>.
  //
  // This was previously unsupported — a "&gt; quoted" line fell through to
  // renderParagraph and came out as an escaped literal "&gt;". Now that legacy
  // markdown is migrated to HTML on first read (see src/lib/richText.ts), an
  // unsupported case is no longer just "shown oddly", it's baked permanently
  // into the stored document, so it needs handling here.
  const quoteLines = nonListLines.filter(isMarkdownQuoteLine).map(stripMarkdownQuoteMarker);
  const proseLines = nonListLines.filter((line) => !isMarkdownQuoteLine(line));

  if (proseLines.length > 0) {
    sections.push(renderParagraph(proseLines));
  }

  if (quoteLines.length > 0) {
    sections.push(`<blockquote>${quoteLines.map((line) => markdownInlineToHtml(line)).join("<br />")}</blockquote>`);
  }

  return sections.join("");
}

function renderParagraph(content: string | string[]): string {
  const lines = Array.isArray(content) ? content : [content];
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (!cleaned.length) return "";
  return `<p>${cleaned.map((line) => markdownInlineToHtml(line)).join("<br />")}</p>`;
}

function isMarkdownHeading(value: string): boolean {
  return /^#{1,6}\s+/.test(value) || /^\*\*[^*]+\*\*$/.test(value) || /^__[^_]+__$/.test(value);
}

function stripMarkdownHeading(value: string): string {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*([^*]+)\*\*$/, "$1")
    .replace(/^__([^_]+)__$/, "$1")
    .trim();
}

function isMarkdownListItem(value: string): boolean {
  return /^[-*]\s+/.test(value) || /^\d+\.\s+/.test(value);
}

function isMarkdownQuoteLine(value: string): boolean {
  return /^>\s?/.test(value);
}

function stripMarkdownQuoteMarker(value: string): string {
  return value.replace(/^>\s?/, "").trim();
}

function stripMarkdownListMarker(value: string): string {
  return value.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

function markdownInlineToHtml(value: string): string {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
