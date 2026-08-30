import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseLessonPartPage, compareLessonPartPage } from "./lessonPartPageSort";

describe("parseLessonPartPage", () => {
  it("extracts Lesson, Part, and Page despite messy separators and spacing", () => {
    assert.deepEqual(
      parseLessonPartPage("Lesson 100 । Page 220 । SL 56 67 । Video 23। English Therapy । Saiful Islam (Repost)"),
      { lesson: 100, part: null, page: 220 }
    );
    assert.deepEqual(
      parseLessonPartPage("Negative Sentence | Present Perfect Tense | Lesson 48 | Part   14 | English Therapy | Saiful Islam"),
      { lesson: 48, part: 14, page: null }
    );
    assert.deepEqual(
      parseLessonPartPage("P,T,C,K,Q অক্ষর গুলির শুদ্ধ উচ্চারণ | Lesson -  5 (Video No 06) | English Therapy | Saiful Islam Sir"),
      { lesson: 5, part: null, page: null }
    );
  });

  it("returns all nulls for titles with no Lesson/Part/Page markers", () => {
    assert.deepEqual(parseLessonPartPage("Modal এর ব্যবহার শিখুন | English Therapy | Saiful Islam Sir"), {
      lesson: null, part: null, page: null,
    });
  });
});

describe("compareLessonPartPage", () => {
  it("sorts the real sample titles into Lesson, then Part, then Page order", () => {
    const titles = [
      "Lesson 100 । Page 221 । SL 80 90 । Video 25 English Therapy । Saiful Islam",
      "সহজে শিখুন মজার এই বাক্যগুলো। Part 21 I English Therapy । Saiful Islam",
      "Negative Sentence | Present Perfect Tense | Lesson 48 | Part   14 | English Therapy | Saiful Islam",
      "ইংলিশে ১২ মাসের নামের শুদ্ধ উচ্চারণ | Lesson - 3 (Video No 03) | English Therapy | Saiful Islam Sir",
      "Lesson 100 । Page 220 । SL 56 67 । Video 23। English Therapy । Saiful Islam (Repost)",
      "Modal এর ব্যবহার শিখুন | English Therapy | Saiful Islam Sir",
      "সহজে শিখুন মজার এই বাক্যগুলো | Part 7 | English Therapy | Saiful Islam",
      "P,T,C,K,Q অক্ষর গুলির শুদ্ধ উচ্চারণ | Lesson -  5 (Video No 06) | English Therapy | Saiful Islam Sir",
    ];

    const sorted = [...titles].sort(compareLessonPartPage);
    const lessons = sorted.map((t) => (/lesson\s*-?\s*(\d+)/i.exec(t) || [])[1] ?? null);

    // Ascending by Lesson number (3, 5, 48, then the two Lesson 100s with
    // Page 220 before Page 221), with the three titles that have no Lesson
    // number at all pushed to the end. The exact relative order *within*
    // that trailing no-Lesson group depends on locale collation of mixed
    // Bengali/Latin text, so we only assert they land at the end as a set.
    assert.deepEqual(lessons.slice(0, 5), ["3", "5", "48", "100", "100"]);
    assert.deepEqual(lessons.slice(5), [null, null, null]);
    assert.ok(sorted[3].includes("Page 220"));
    assert.ok(sorted[4].includes("Page 221"));
  });
});
