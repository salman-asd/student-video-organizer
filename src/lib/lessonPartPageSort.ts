/**
 * Real course-title conventions ("Lesson 100 । Page 220 । SL 56 67 । Video
 * 23", "Part   14" with stray spaces, "Lesson -  5", mixed Bengali/English
 * separators) don't sort correctly with either plain alphabetical or
 * generic natural (numeric-aware) sort — those only look at the title as
 * one string, left to right, so "Video 23" outranks "Lesson 100" the
 * moment it's compared. This extracts the specific Lesson / Part / Page
 * numbers wherever they appear in the title and sorts by that priority
 * instead: Lesson first, Part as a tiebreaker within the same lesson,
 * Page as a tiebreaker within that.
 */

export interface LessonPartPageKey {
  lesson: number | null;
  part: number | null;
  page: number | null;
}

function extractNumberAfter(title: string, keyword: string): number | null {
  // Tolerates "Lesson 100", "Lesson - 5", "Lesson -  5" (stray spaces),
  // "Part   14" (multiple spaces), case-insensitive.
  const match = new RegExp(`${keyword}\\s*-?\\s*(\\d+)`, "i").exec(title);
  return match ? Number(match[1]) : null;
}

export function parseLessonPartPage(title: string): LessonPartPageKey {
  return {
    lesson: extractNumberAfter(title, "lesson"),
    part: extractNumberAfter(title, "part"),
    page: extractNumberAfter(title, "page"),
  };
}

const naturalTitleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/**
 * Titles with no Lesson number at all (one-off videos like a standalone
 * "Modal এর ব্যবহার শিখুন...") are sorted after every numbered lesson,
 * rather than interleaved based on Part/Page numbers that don't really
 * mean the same thing without a Lesson to anchor them — grouped together
 * at the end, in natural title order among themselves.
 */
export function compareLessonPartPage(titleA: string, titleB: string): number {
  const a = parseLessonPartPage(titleA);
  const b = parseLessonPartPage(titleB);

  if (a.lesson === null && b.lesson === null) return naturalTitleCollator.compare(titleA, titleB);
  if (a.lesson === null) return 1;
  if (b.lesson === null) return -1;
  if (a.lesson !== b.lesson) return a.lesson - b.lesson;

  const aPart = a.part ?? -1;
  const bPart = b.part ?? -1;
  if (aPart !== bPart) return aPart - bPart;

  const aPage = a.page ?? -1;
  const bPage = b.page ?? -1;
  if (aPage !== bPage) return aPage - bPage;

  return naturalTitleCollator.compare(titleA, titleB);
}
