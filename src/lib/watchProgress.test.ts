import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { calculateProgress, isResumeEligible, isVideoComplete, shouldPersistProgress } from "./watchProgress";

describe("watch progress calculations", () => {
  it("calculates progress percentage and completion state", () => {
    const result = calculateProgress(45, 180);
    assert.equal(result.percent, 25);
    assert.equal(result.completed, false);

    const complete = calculateProgress(171, 180);
    assert.equal(complete.percent, 95);
    assert.equal(complete.completed, true);
  });

  it("throttles persistence when the change is too small or too frequent", () => {
    assert.equal(shouldPersistProgress({ currentSeconds: 30, durationSeconds: 180, lastSavedAt: 0, now: 1000, previousSeconds: 20 }), true);
    assert.equal(shouldPersistProgress({ currentSeconds: 31, durationSeconds: 180, lastSavedAt: 1000, now: 1400, previousSeconds: 30 }), false);
    assert.equal(shouldPersistProgress({ currentSeconds: 120, durationSeconds: 180, lastSavedAt: 0, now: 2000, previousSeconds: 90 }), true);
  });

  it("marks only legitimately started, unfinished videos as resume-eligible", () => {
    assert.equal(isResumeEligible({ status: "in_progress", watchedPercentage: 18, currentPositionSeconds: 32 }), true);
    assert.equal(isResumeEligible({ status: "in_progress", watchedPercentage: 0, currentPositionSeconds: 0 }), false);
    assert.equal(isResumeEligible({ status: "completed", watchedPercentage: 100, currentPositionSeconds: 180 }), false);
    assert.equal(isResumeEligible({ status: "not_started", watchedPercentage: 5, currentPositionSeconds: 10 }), true);
  });
});
