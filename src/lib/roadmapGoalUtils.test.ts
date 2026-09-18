import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseOnboardingRoadmapOffer,
  buildOnboardingRoadmapOffer,
  defaultGoalTargetDateForStep,
  spreadGoalTargetDates,
  currentRoadmapStepIndex,
  isTargetDatePast,
} from "./roadmapGoalUtils";

describe("parseOnboardingRoadmapOffer", () => {
  it("round-trips through the URL encoding", () => {
    const offer = { categoryId: "cat-1", categoryName: "React & Friends", level: "basic" as const };
    const parsed = parseOnboardingRoadmapOffer(buildOnboardingRoadmapOffer(offer));
    assert.deepEqual(parsed, offer);
  });

  it("returns null for missing, empty, or malformed input rather than throwing", () => {
    assert.equal(parseOnboardingRoadmapOffer(null), null);
    assert.equal(parseOnboardingRoadmapOffer(""), null);
    assert.equal(parseOnboardingRoadmapOffer("not-json"), null);
    assert.equal(parseOnboardingRoadmapOffer("[1,2,3]"), null);
    assert.equal(parseOnboardingRoadmapOffer(JSON.stringify("a string")), null);
  });

  it("rejects an offer with an unknown level", () => {
    const raw = encodeURIComponent(JSON.stringify({ categoryId: "c", categoryName: "N", level: "expert" }));
    assert.equal(parseOnboardingRoadmapOffer(raw), null);
  });

  it("rejects an offer missing a category id or name", () => {
    const noId = encodeURIComponent(JSON.stringify({ categoryName: "N", level: "basic" }));
    const noName = encodeURIComponent(JSON.stringify({ categoryId: "c", level: "basic" }));
    assert.equal(parseOnboardingRoadmapOffer(noId), null);
    assert.equal(parseOnboardingRoadmapOffer(noName), null);
  });
});

describe("defaultGoalTargetDateForStep", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("anchors on the step's week", () => {
    assert.equal(defaultGoalTargetDateForStep({ week: 4 }, now), "2026-07-13");
  });

  it("defaults to two weeks when the step has no week", () => {
    assert.equal(defaultGoalTargetDateForStep({}, now), "2026-06-29");
  });

  it("clamps a nonsensical week instead of producing a past or far-future date", () => {
    assert.equal(defaultGoalTargetDateForStep({ week: -5 }, now), "2026-06-29");
    assert.equal(defaultGoalTargetDateForStep({ week: 99999 }, now), "2027-06-15");
  });
});

describe("spreadGoalTargetDates", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("uses each step's week when set, so goals don't stack on one date", () => {
    const dates = spreadGoalTargetDates([{ week: 1 }, { week: 3 }], now);
    assert.deepEqual(dates, ["2026-06-22", "2026-07-06"]);
    assert.notEqual(dates[0], dates[1]);
  });

  it("spaces week-less steps by the fallback spacing", () => {
    assert.deepEqual(spreadGoalTargetDates([{}, {}, {}], now, 7), ["2026-06-22", "2026-06-29", "2026-07-06"]);
  });

  it("returns an empty array for no steps", () => {
    assert.deepEqual(spreadGoalTargetDates([], now), []);
  });
});

describe("currentRoadmapStepIndex", () => {
  const steps = Array.from({ length: 4 }, (_, i) => ({ title: `s${i}`, description: "", order: i }));

  it("returns 0 for an empty roadmap", () => {
    assert.equal(currentRoadmapStepIndex([], 5), 0);
  });

  it("advances one step per completed video", () => {
    assert.equal(currentRoadmapStepIndex(steps, 0), 0);
    assert.equal(currentRoadmapStepIndex(steps, 2), 2);
  });

  it("caps at the last step so it never runs off the end", () => {
    assert.equal(currentRoadmapStepIndex(steps, 99), 3);
  });

  it("treats a negative or non-finite completed count as zero", () => {
    assert.equal(currentRoadmapStepIndex(steps, -3), 0);
    assert.equal(currentRoadmapStepIndex(steps, Number.NaN), 0);
  });
});

describe("isTargetDatePast", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("is true only for dates before today", () => {
    assert.equal(isTargetDatePast("2026-06-14", now), true);
    assert.equal(isTargetDatePast("2026-06-15", now), false);
    assert.equal(isTargetDatePast("2026-06-16", now), false);
  });

  it("is false for a missing or unparseable date", () => {
    assert.equal(isTargetDatePast(null, now), false);
    assert.equal(isTargetDatePast("not-a-date", now), false);
  });
});
