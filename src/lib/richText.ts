/**
 * Summary content format: storage, normalization, and migration.
 *
 * ─────────────────────────────
 * HOW SUMMARY DATA IS CURRENTLY STORED  (users/{uid}/summaries/{videoId})
 * ─────────────────────────────
 * `content: string`, and the format is NOT uniform. Three shapes exist:
 *
 *   1. HTML from Tiptap   — "<p>hello</p>", what the editor writes today,
 *                           plus everything in the AI-generated path.
 *   2. Markdown-ish text  — "**English Tense**\n\n- one\n- two", written by
 *                           earlier versions of this feature and still very
 *                           much present in existing documents.
 *   3. Plain text         — "just some notes", no markup at all.
 *
 * The previous code coped with all three at DISPLAY time via toSummaryHtml(),
 * which sniffed the string, converted markdown to HTML on the fly, and
 * sanitized. That approach caused the exact bug this module exists to fix:
 * the editor only ever rendered formatting it already understood, so a
 * markdown block that the display path converted correctly still showed as
 * literal `**bold**` while you were typing.
 *
 * ─────────────────────────────
 * THE DECISION
 * ─────────────────────────────
 * HTML is the storage format. It is the only lossless option here — Tiptap's
 * native model is HTML, and every structured thing a user can build (nested
 * lists, headings, quotes) has a direct HTML representation. Markdown would
 * mean writing and maintaining a bidirectional HTML<->MD converter for a
 * feature where the user never types syntax and never sees the raw string.
 *
 * So instead of converting on every read forever, content is normalized to
 * HTML ONCE, lazily, the first time a legacy document is opened. After that
 * every surface — editor, video page, share page — reads pure HTML and there
 * is exactly one format in the database.
 *
 * The migration is deliberately conservative: it only runs on documents that
 * are obviously not HTML, never rewrites something already in HTML, and is
 * idempotent (running it twice produces the same string).
 */

import { toSummaryHtml } from "@/lib/summaryHtml";

/** True when the value is already HTML produced by the editor. */
export function isHtmlContent(value: string): boolean {
  return /^<\/?(p|h[1-6]|ul|ol|li|blockquote|pre|div|strong|em)\b/i.test((value ?? "").trim());
}

/**
 * True when the value carries markdown the user would expect to see rendered
 * (bold, italic, headings, or list markers) rather than plain prose.
 */
export function looksLikeMarkdown(value: string): boolean {
  const raw = (value ?? "").trim();
  if (!raw || isHtmlContent(raw)) return false;
  return (
    /^\s{0,3}#{1,6}\s+\S/m.test(raw) ||
    /^\s{0,3}\*\*[^*\n]+\*\s*$/m.test(raw) ||
    /^\s{0,3}[-*]\s+\S/m.test(raw) ||
    /^\s{0,3}\d+\.\s+\S/m.test(raw) ||
    /\*\*[^*\n]+\*\*/.test(raw) ||
    /__[^_\n]+__/.test(raw)
  );
}

/**
 * Converts stored content to the canonical HTML format.
 *
 * Safe to call on anything: HTML passes through unchanged (after the existing
 * sanitizer), markdown and plain text are converted, empty stays empty. This
 * is the single entry point every read path should use.
 */
export function normalizeSummaryContent(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return toSummaryHtml(raw);
}

/**
 * Whether a stored document should be rewritten to the canonical format.
 * False for HTML and for empty content, so opening an already-migrated
 * summary never triggers a pointless write.
 */
export function needsMigration(value: string): boolean {
  const raw = (value ?? "").trim();
  if (!raw) return false;
  if (isHtmlContent(raw)) return false;
  // Plain text with no markup is harmless to leave alone, but converting it is
  // also lossless and gets it onto one format. Only migrate when the content
  // would actually change, which keeps plain prose from causing a write.
  return normalizeSummaryContent(raw) !== raw;
}

/**
 * Editor-oriented normalization: strips the empty-document scaffolding Tiptap
 * leaves behind. `<p></p>` is what an "empty" editor serializes to, and
 * storing it means the next read sees a non-empty value and renders a blank
 * paragraph where the placeholder should be.
 */
export function normalizeEditorOutput(html: string): string {
  const raw = (html ?? "").trim();
  if (!raw) return "";
  if (isEmptyEditorHtml(raw)) return "";
  return raw;
}

export function isEmptyEditorHtml(html: string): boolean {
  const stripped = (html ?? "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, "")
    .trim();
  return stripped.length === 0;
}
