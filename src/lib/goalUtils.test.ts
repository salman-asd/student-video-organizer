import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeDueDate, isGoalOverdue, getGoalLinkedPlaylists, calculateGoalProgress } from "./goalUtils";

const REFERENCE = new Date("2026-08-30T12:00:00Z");

describe("describeDueDate", () => {
  it("returns no status when there is no target date", () => {
    assert.deepEqual(describeDueDate(null, false, REFERENCE), { status: "none", label: "" });
    assert.deepEqual(describeDueDate(undefined, false, REFERENCE), { status: "none", label: "" });
  });

  it("flags a past date as overdue with the day count", () => {
    const result = describeDueDate("2026-08-27", false, REFERENCE);
    assert.equal(result.status, "overdue");
    assert.match(result.label, /Overdue by 3 days/);
  });

  it("flags today's date as due today", () => {
    assert.equal(describeDueDate("2026-08-30", false, REFERENCE).status, "today");
  });

  it("flags a date within 3 days as due soon", () => {
    assert.equal(describeDueDate("2026-09-02", false, REFERENCE).status, "soon");
  });

  it("flags a farther-out date as upcoming", () => {
    assert.equal(describeDueDate("2026-09-20", false, REFERENCE).status, "upcoming");
  });

  it("never reports a completed goal as overdue", () => {
    const result = describeDueDate("2026-08-01", true, REFERENCE);
    assert.equal(result.status, "none");
    assert.match(result.label, /Was due/);
  });
});

describe("isGoalOverdue", () => {
  it("is true only for incomplete goals with a past due date", () => {
    assert.equal(isGoalOverdue({ targetDate: "2026-08-01", completed: false }, REFERENCE), true);
    assert.equal(isGoalOverdue({ targetDate: "2026-08-01", completed: true }, REFERENCE), false);
    assert.equal(isGoalOverdue({ targetDate: null, completed: false }, REFERENCE), false);
    assert.equal(isGoalOverdue({ targetDate: "2026-09-20", completed: false }, REFERENCE), false);
  });
});

describe("getGoalLinkedPlaylists", () => {
  it("prefers the new linkedPlaylists array when present", () => {
    const result = getGoalLinkedPlaylists({
      linkedPlaylists: [{ id: "p1", title: "Grammar" }, { id: "p2", title: "Vocabulary" }],
      linkedPlaylistId: "legacy", linkedPlaylistTitle: "Legacy",
    });
    assert.deepEqual(result, [{ id: "p1", title: "Grammar" }, { id: "p2", title: "Vocabulary" }]);
  });

  it("falls back to the legacy single-playlist fields for older goals", () => {
    const result = getGoalLinkedPlaylists({ linkedPlaylistId: "p1", linkedPlaylistTitle: "Grammar" });
    assert.deepEqual(result, [{ id: "p1", title: "Grammar" }]);
  });

  it("falls back to a placeholder title if the legacy title was never set", () => {
    const result = getGoalLinkedPlaylists({ linkedPlaylistId: "p1" });
    assert.deepEqual(result, [{ id: "p1", title: "Untitled playlist" }]);
  });

  it("returns an empty array when nothing is linked", () => {
    assert.deepEqual(getGoalLinkedPlaylists({}), []);
  });
});

describe("calculateGoalProgress", () => {
  const allVideos = [
    { id: "v1", playlistId: "p1", status: "completed" },
    { id: "v2", playlistId: "p1", status: "not_started" },
    { id: "v3", playlistId: "p2", status: "completed" },
    { id: "v4", playlistId: "p3", status: "not_started" },
  ];

  it("counts every video across all linked playlists", () => {
    const goal = { linkedPlaylists: [{ id: "p1", title: "A" }, { id: "p2", title: "B" }] };
    assert.deepEqual(calculateGoalProgress(goal, allVideos), { watched: 2, total: 3 });
  });

  it("counts individually linked videos alongside linked playlists", () => {
    const goal = {
      linkedPlaylists: [{ id: "p1", title: "A" }],
      linkedVideos: [{ id: "v4", playlistId: "p3", playlistTitle: "C", title: "Video 4" }],
    };
    assert.deepEqual(calculateGoalProgress(goal, allVideos), { watched: 1, total: 3 });
  });

  it("never double-counts a video that is both individually linked and inside a linked playlist", () => {
    const goal = {
      linkedPlaylists: [{ id: "p1", title: "A" }],
      linkedVideos: [{ id: "v1", playlistId: "p1", playlistTitle: "A", title: "Video 1" }],
    };
    // v1 belongs to p1 (already counted via the playlist) AND is listed
    // individually — total must still be 2 (v1, v2), not 3.
    assert.deepEqual(calculateGoalProgress(goal, allVideos), { watched: 1, total: 2 });
  });

  it("supports the legacy single-playlist field", () => {
    const goal = { linkedPlaylistId: "p2", linkedPlaylistTitle: "B" };
    assert.deepEqual(calculateGoalProgress(goal, allVideos), { watched: 1, total: 1 });
  });

  it("returns zero/zero for a goal with nothing linked", () => {
    assert.deepEqual(calculateGoalProgress({}, allVideos), { watched: 0, total: 0 });
  });
});
