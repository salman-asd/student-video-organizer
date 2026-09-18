import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findGoalsBehindPace, goalPaceMarker, paceNotificationCopy } from "./goalPace";
import type { Goal } from "@/types";

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    title: "Finish the React playlist",
    completed: false,
    targetDate: "2026-07-01",
    linkedPlaylists: [{ id: "p1", title: "React" }],
    createdAt: null,
    ...overrides,
  } as Goal;
}

/** Ten videos, none watched, all inside the linked playlist. */
function videos(total: number, completed: number) {
  return Array.from({ length: total }, (_, i) => ({
    id: `v${i}`,
    playlistId: "p1",
    status: i < completed ? "completed" : "not_started",
  }));
}

describe("findGoalsBehindPace", () => {
  const now = new Date("2026-06-29T12:00:00.000Z");

  it("flags a goal whose deadline is near with nothing watched", () => {
    const behind = findGoalsBehindPace([goal({ targetDate: "2026-07-01" })], videos(10, 0), now);
    assert.equal(behind.length, 1);
    assert.equal(behind[0].goal.id, "g1");
    assert.ok(behind[0].daysBehind > 1);
  });

  it("does not flag a goal that is comfortably on track", () => {
    // 20 videos, 10 done, 30 days to go: ~0.33/day needed.
    const result = findGoalsBehindPace(
      [goal({ targetDate: "2026-07-29" })],
      videos(20, 10),
      now
    );
    assert.deepEqual(result, []);
  });

  it("ignores small slippage rather than firing on every fluctuation", () => {
    // 4 videos left over 6 days = 0.67/day needed. "behind" by the pace
    // status rules only when required pace exceeds 1/day; this must not notify.
    const result = findGoalsBehindPace([goal({ targetDate: "2026-07-05" })], videos(10, 6), now);
    assert.deepEqual(result, []);
  });

  it("skips completed goals", () => {
    const result = findGoalsBehindPace([goal({ completed: true, targetDate: "2026-07-01" })], videos(10, 0), now);
    assert.deepEqual(result, []);
  });

  it("skips goals with no target date", () => {
    const result = findGoalsBehindPace([goal({ targetDate: null })], videos(10, 0), now);
    assert.deepEqual(result, []);
  });

  it("skips goals with nothing linked, which have no meaningful pace", () => {
    const unlinked = goal({ linkedPlaylists: [], linkedVideos: [], targetDate: "2026-07-01" });
    const result = findGoalsBehindPace([unlinked], videos(10, 0), now);
    assert.deepEqual(result, []);
  });

  it("treats an overdue goal with work left as behind", () => {
    const result = findGoalsBehindPace([goal({ targetDate: "2026-06-20" })], videos(10, 8), now);
    assert.equal(result.length, 1);
    assert.equal(result[0].pace.status, "overdue");
    assert.equal(result[0].daysBehind, 2);
  });

  it("orders the worst-off goal first", () => {
    const slight = goal({ id: "slight", targetDate: "2026-07-03" });
    const severe = goal({ id: "severe", targetDate: "2026-06-28" });
    const result = findGoalsBehindPace([slight, severe], videos(20, 0), now);
    assert.equal(result[0].goal.id, "severe");
  });
});

describe("paceNotificationCopy", () => {
  it("describes the remaining work and rate for a behind goal", () => {
    const [entry] = findGoalsBehindPace(
      [goal({ targetDate: "2026-07-01" })],
      videos(10, 0),
      new Date("2026-06-29T12:00:00.000Z")
    );
    const copy = paceNotificationCopy(entry);
    assert.match(copy, /10 videos/);
    assert.match(copy, /behind/);
  });

  it("says the deadline passed for an overdue goal", () => {
    const [entry] = findGoalsBehindPace(
      [goal({ targetDate: "2026-06-20" })],
      videos(10, 8),
      new Date("2026-06-29T12:00:00.000Z")
    );
    assert.match(paceNotificationCopy(entry), /deadline has passed/);
  });
});

describe("goalPaceMarker", () => {
  it("extracts a stable identity from a goal link", () => {
    assert.equal(goalPaceMarker("/goals?goal=abc123"), "goal_pace:abc123");
    assert.equal(goalPaceMarker("/goals?goal=abc123&x=1"), "goal_pace:abc123");
  });

  it("is empty for a missing link so unlinked notifications never collide", () => {
    assert.equal(goalPaceMarker(null), "");
    assert.equal(goalPaceMarker(undefined), "");
  });
});
