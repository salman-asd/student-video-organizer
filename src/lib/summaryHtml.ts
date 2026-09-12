export function toSummaryHtml(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
    return raw;
  }

  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return "";

  return blocks.map(renderBlock).join("");
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

  if (nonListLines.length > 0) {
    sections.push(renderParagraph(nonListLines.join("<br />")));
  }

  return sections.join("");
}

function renderParagraph(content: string): string {
  const cleaned = content.trim();
  if (!cleaned) return "";
  return `<p>${markdownInlineToHtml(cleaned)}</p>`;
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
