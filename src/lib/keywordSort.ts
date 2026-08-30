/**
 * Generalizes the Lesson → Part → Page idea (see lessonPartPageSort.ts) to
 * ANY set of keywords a user types in, in whatever priority order they
 * choose. Different playlists use different course-title conventions —
 * "Chapter 3 - Unit 2", "Module 4 | Week 1", "Set 2 - Sheet 10" — and there's
 * no way to hardcode all of them. Instead this extracts the number that
 * follows each user-supplied keyword wherever it appears in the title, and
 * sorts by those numbers in the order the keywords were given: the first
 * keyword is the primary sort key, the second breaks ties within the first,
 * and so on — exactly how Lesson/Part/Page already behaves, just with
 * user-defined words instead of a fixed three.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Tolerates "Chapter 3", "Chapter - 3", "Chapter   3" (stray/extra spaces),
 *  case-insensitive, same convention as lessonPartPageSort's extractor. */
export function extractNumberAfterKeyword(title: string, keyword: string): number | null {
  const trimmed = keyword.trim();
  if (!trimmed) return null;
  const match = new RegExp(`${escapeRegExp(trimmed)}\\s*-?\\s*(\\d+)`, "i").exec(title);
  return match ? Number(match[1]) : null;
}

export function parseKeywordNumbers(title: string, keywords: string[]): (number | null)[] {
  return keywords.map((keyword) => extractNumberAfterKeyword(title, keyword));
}

/** Splits a user-typed "Chapter, Unit, Page" style input into a clean,
 *  ordered, de-duplicated keyword list. */
export function parseKeywordInput(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(",")) {
    const keyword = raw.trim();
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

const naturalTitleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Titles that don't match the first (primary) keyword at all are sorted
 * after every title that does — same "unmatched goes last, grouped
 * together in natural order" behavior as compareLessonPartPage — since a
 * secondary keyword number doesn't mean much without the primary keyword to
 * anchor it.
 */
export function compareByKeywords(titleA: string, titleB: string, keywords: string[]): number {
  if (keywords.length === 0) return naturalTitleCollator.compare(titleA, titleB);

  const a = parseKeywordNumbers(titleA, keywords);
  const b = parseKeywordNumbers(titleB, keywords);

  if (a[0] === null && b[0] === null) return naturalTitleCollator.compare(titleA, titleB);
  if (a[0] === null) return 1;
  if (b[0] === null) return -1;

  for (let i = 0; i < keywords.length; i++) {
    const aValue = a[i] ?? -1;
    const bValue = b[i] ?? -1;
    if (aValue !== bValue) return aValue - bValue;
  }

  return naturalTitleCollator.compare(titleA, titleB);
}
