import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeRoadmapSteps, renumberSteps, buildPlaylistSearchQuery, goalDraftTargetDate } from "./roadmapUtils";

describe("sanitizeRoadmapSteps", () => {
  it("keeps valid roadmap steps and ignores blank or malformed entries", () => {
    const result = sanitizeRoadmapSteps([
      { title: "Learn the basics", description: "Start with fundamentals.", order: 1 },
      { title: "", description: "Missing title.", order: 2 },
      { title: "Practice", description: "Apply it.", order: 0 },
      { title: "Wrap up", description: "Review progress.", order: 3 },
      null,
    ]);

    assert.deepEqual(result, [
      { title: "Practice", description: "Apply it.", order: 0 },
      { title: "Learn the basics", description: "Start with fundamentals.", order: 1 },
      { title: "Wrap up", description: "Review progress.", order: 3 },
    ]);
  });

  it("fills missing descriptions and reorders by the provided step order", () => {
    const result = sanitizeRoadmapSteps([
      { title: "Final review", description: "", order: 5 },
      { title: "Practice", order: 2 },
      { title: "Foundation", description: "Build confidence.", order: 1 },
    ]);

    assert.deepEqual(result, [
      { title: "Foundation", description: "Build confidence.", order: 1 },
      { title: "Practice", description: "", order: 2 },
      { title: "Final review", description: "", order: 5 },
    ]);
  });
});

describe("renumberSteps", () => {
  it("assigns order from array position without re-sorting", () => {
    const result = renumberSteps([
      { title: "Wrap up", description: "Review progress.", order: 3 },
      { title: "Foundation", description: "Build confidence.", order: 1 },
      { title: "Practice", description: "", order: 0 },
    ]);

    assert.deepEqual(result, [
      { title: "Wrap up", description: "Review progress.", order: 0 },
      { title: "Foundation", description: "Build confidence.", order: 1 },
      { title: "Practice", description: "", order: 2 },
    ]);
  });
});

describe("buildPlaylistSearchQuery", () => {
  it("combines step title and category name", () => {
    assert.equal(buildPlaylistSearchQuery("React hooks", "Frontend Development"), "React hooks Frontend Development playlist");
  });

  it("falls back to whichever half is present", () => {
    assert.equal(buildPlaylistSearchQuery("React hooks", ""), "React hooks");
    assert.equal(buildPlaylistSearchQuery("", "Frontend Development"), "Frontend Development");
    assert.equal(buildPlaylistSearchQuery("", ""), "");
  });
});

describe("goalDraftTargetDate", () => {
  it("adds the given number of days to the reference date", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(goalDraftTargetDate(14, now), "2026-01-15");
  });

  it("clamps out-of-range or invalid offsets into a sane 1-365 day window", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    assert.equal(goalDraftTargetDate(0, now), "2026-01-02");
    assert.equal(goalDraftTargetDate(-5, now), "2026-01-02");
    assert.equal(goalDraftTargetDate(9999, now), "2027-01-01");
    assert.equal(goalDraftTargetDate(Number.NaN, now), "2026-01-15");
  });
});
