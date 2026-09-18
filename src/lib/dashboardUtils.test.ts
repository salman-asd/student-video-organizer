import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCategoryNameMap,
  buildGoalPaceRows,
  buildRoadmapFocusRows,
  buildWeeklyActivity,
  countCompletedSince,
  isBrandNewUser,
  pickPrimaryFocus,
  resolveCategoryName,
} from "./dashboardUtils";
import type { Category, Goal, LearningRoadmap, UserInterest } from "@/types";

// ── Fixtures ────────────────────────────────
// Kept as factory functions rather than inline literals so the object nesting
// stays readable and every test builds its data the same way.

function makeCategory(id: string, name: string) {
  return { id, name } as Category;
}

const CATEGORIES = [makeCategory("catReact", "React"), makeCategory("catPython", "Python")];
const INTERESTS: UserInterest[] = [{ categoryId: "catReact", level: "basic" }];

function makeRoadmap(overrides: Partial<LearningRoadmap> = {}): LearningRoadmap {
  const steps = [
    { title: "Hooks", description: "", order: 0 },
    { title: "Routing", description: "", order: 1 },
    { title: "Data fetching", description: "", order: 2 },
  ];
  const base = {
    id: "r1",
    categoryId: "catReact",
    level: "basic" as const,
    steps,
    createdAt: null,
    updatedAt: null,
    adoptedFromTemplateAt: null,
  };
  return { ...base, ...overrides };
}

/** A stand-in for a Firestore Timestamp — the helpers only call toDate/toMillis. */
function stamp(date: Date) {
  return { toDate: () => date, toMillis: () => date.getTime() };
}

/**
 * buildWeeklyActivity buckets by LOCAL calendar day, because "Monday" means the
 * user's Monday. So these fixtures use local-time constructors: a fixture like
 * new Date("2026-06-29T20:00:00Z") lands on 06-30 for anyone east of UTC, and
 * the test would then pass or fail depending on the machine's timezone.
 */
function localDate(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function completedOn(date: Date, id?: string) {
  const state = { status: "completed", completedAt: stamp(date) };
  return { id: id ?? `v-${date.getTime()}`, playlistId: "pl", state };
}

function inProgressOn(date: Date) {
  const state = { status: "in_progress", completedAt: stamp(date) };
  return { id: `prog-${date.getTime()}`, playlistId: "pl", state };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  const base = {
    id: "g1",
    title: "Finish React",
    completed: false,
    targetDate: "2026-07-01",
    linkedPlaylists: [{ id: "p1", title: "React" }],
    createdAt: null,
  };
  return { ...base, ...overrides } as Goal;
}

function linkedVideos(total: number, done: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `v${i}`,
    playlistId: "p1",
    status: i < done ? "completed" : "not_started",
  }));
}

// ── Tests ───────────────────

describe("buildCategoryNameMap / resolveCategoryName", () => {
  it("resolves an id to its display name", () => {
    const names = buildCategoryNameMap(CATEGORIES);
    assert.equal(resolveCategoryName("catReact", names), "React");
  });

  it("returns a flagged placeholder rather than the raw id when unknown", () => {
    const names = buildCategoryNameMap(CATEGORIES);
    assert.equal(resolveCategoryName("missing", names), "Unknown topic");
    assert.equal(resolveCategoryName(null, names), "Unknown topic");
  });

  it("honours a caller-supplied fallback, and blank names never win", () => {
    const names = buildCategoryNameMap([makeCategory("x", "   "), makeCategory("y", "Real")]);
    assert.equal(resolveCategoryName("x", names, "Fallback"), "Fallback");
    assert.equal(resolveCategoryName("y", names, "Fallback"), "Real");
  });
});

describe("buildRoadmapFocusRows (the wrong-title bug)", () => {
  it("renders the category NAME, never the raw category id", () => {
    const rows = buildRoadmapFocusRows(INTERESTS, [makeRoadmap()], [], buildCategoryNameMap(CATEGORIES));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].categoryName, "React");
    assert.notEqual(rows[0].categoryName, "catReact");
  });

  it("reports the real current step and a progress percent that agrees with it", () => {
    const videos = [
      { id: "v1", categoryId: "catReact", state: { status: "completed" } },
      { id: "v2", categoryId: "catReact", state: { status: "completed" } },
    ];
    const rows = buildRoadmapFocusRows(INTERESTS, [makeRoadmap()], videos, buildCategoryNameMap(CATEGORIES));
    assert.equal(rows[0].currentStepIndex, 2);
    assert.equal(rows[0].currentStepTitle, "Data fetching");
    assert.equal(rows[0].completedVideos, 2);
    // On the final step, so the bar reads 100% — the user has reached the end
    // of the roadmap even though only 2 of 3 steps were "consumed".
    assert.equal(rows[0].progressPercent, 100);
  });

  it("caps at the last step instead of running off the end", () => {
    const videos = Array.from({ length: 10 }, (_, i) => ({
      id: `v${i}`,
      categoryId: "catReact",
      state: { status: "completed" },
    }));
    const rows = buildRoadmapFocusRows(INTERESTS, [makeRoadmap()], videos, buildCategoryNameMap(CATEGORIES));
    assert.equal(rows[0].currentStepIndex, 2);
    assert.equal(rows[0].currentStepTitle, "Data fetching");
  });

  it("skips an interest that has no roadmap at all", () => {
    const rows = buildRoadmapFocusRows(
      [{ categoryId: "catPython", level: null }],
      [makeRoadmap()],
      [],
      buildCategoryNameMap(CATEGORIES)
    );
    assert.deepEqual(rows, []);
  });

  it("skips a roadmap with no steps", () => {
    const rows = buildRoadmapFocusRows(INTERESTS, [makeRoadmap({ steps: [] })], [], buildCategoryNameMap(CATEGORIES));
    assert.deepEqual(rows, []);
  });
});

describe("pickPrimaryFocus", () => {
  it("returns null for no rows", () => {
    assert.equal(pickPrimaryFocus([]), null);
  });

  it("prefers the most complete focus area", () => {
    const rows = [
      { id: "a", progressPercent: 10 },
      { id: "b", progressPercent: 80 },
    ] as any[];
    assert.equal(pickPrimaryFocus(rows)?.id, "b");
  });
});

describe("buildGoalPaceRows", () => {
  const now = new Date("2026-06-29T12:00:00.000Z");

  it("excludes completed goals", () => {
    assert.deepEqual(buildGoalPaceRows([makeGoal({ completed: true })], linkedVideos(5, 5), now), []);
  });

  it("computes progress and pace for an active goal", () => {
    const rows = buildGoalPaceRows([makeGoal()], linkedVideos(10, 5), now);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].watched, 5);
    assert.equal(rows[0].total, 10);
    assert.equal(rows[0].progressPercent, 50);
    assert.equal(rows[0].status, "behind");
  });

  it("sorts the worst-off goal first", () => {
    const onTrack = makeGoal({ id: "ok", targetDate: "2026-08-30" });
    const overdue = makeGoal({ id: "late", targetDate: "2026-06-01" });
    const rows = buildGoalPaceRows([onTrack, overdue], linkedVideos(10, 2), now);
    assert.equal(rows[0].id, "late");
  });
});

describe("isBrandNewUser", () => {
  const nothing = { interests: [], roadmaps: [], goals: [], videoCount: 0 };

  it("is true only when there is nothing at all set up", () => {
    assert.equal(isBrandNewUser(nothing), true);
  });

  it("is false once any signal exists", () => {
    assert.equal(isBrandNewUser({ ...nothing, interests: INTERESTS }), false);
    assert.equal(isBrandNewUser({ ...nothing, roadmaps: [makeRoadmap()] }), false);
    assert.equal(isBrandNewUser({ ...nothing, goals: [makeGoal()] }), false);
    assert.equal(isBrandNewUser({ ...nothing, videoCount: 3 }), false);
  });
});

describe("buildWeeklyActivity", () => {
  const now = localDate(2026, 6, 29, 12); // Monday, local noon

  it("returns one bucket per day, oldest first, when nothing is completed", () => {
    const buckets = buildWeeklyActivity([], now);
    assert.equal(buckets.length, 7);
    assert.deepEqual(
      buckets.map((b) => b.count),
      [0, 0, 0, 0, 0, 0, 0]
    );
  });

  it("counts two completions on the same local day into that one bucket", () => {
    const buckets = buildWeeklyActivity(
      [completedOn(localDate(2026, 6, 29, 9)), completedOn(localDate(2026, 6, 29, 20))],
      now
    );
    const today = buckets[buckets.length - 1];
    assert.equal(today.count, 2);
    assert.equal(buckets.reduce((sum, b) => sum + b.count, 0), 2);
  });

  it("places a completion on an earlier day in that day's bucket", () => {
    const buckets = buildWeeklyActivity([completedOn(localDate(2026, 6, 27, 10))], now);
    const target = buckets.find((b) => b.count === 1);
    assert.equal(target?.dateKey, "2026-06-27");
  });

  it("ignores videos completed before the window", () => {
    const buckets = buildWeeklyActivity([completedOn(localDate(2026, 1, 1))], now);
    assert.equal(
      buckets.reduce((sum, b) => sum + b.count, 0),
      0
    );
  });

  it("ignores in-progress videos", () => {
    const buckets = buildWeeklyActivity([inProgressOn(localDate(2026, 6, 29, 10))], now);
    assert.equal(
      buckets.reduce((sum, b) => sum + b.count, 0),
      0
    );
  });
});

describe("countCompletedSince", () => {
  const since = localDate(2026, 6, 23);

  it("counts only completions at or after the cutoff", () => {
    const videos = [
      completedOn(localDate(2026, 6, 25)),
      completedOn(localDate(2026, 6, 1)),
      { id: "fresh", playlistId: "pl", state: { status: "not_started", completedAt: null } },
    ];
    assert.equal(countCompletedSince(videos, since), 1);
  });
});
