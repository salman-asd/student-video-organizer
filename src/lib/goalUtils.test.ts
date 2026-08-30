import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeDueDate, isGoalOverdue } from "./goalUtils";

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
