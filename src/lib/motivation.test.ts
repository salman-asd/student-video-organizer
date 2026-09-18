import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MOTIVATION_ROTATION_MS,
  buildMotivationMessage,
  motivationSlot,
  msUntilNextRotation,
  type MotivationInput,
} from "./motivation";
import type { RoadmapFocusRow } from "./dashboardUtils";

function focusRow(overrides: Partial<RoadmapFocusRow> = {}): RoadmapFocusRow {
  const base = {
    id: "cat-1-basic",
    categoryId: "cat-1",
    categoryName: "React",
    level: "basic",
    roadmapId: "r1",
    stepCount: 5,
    completedVideos: 1,
    currentStepIndex: 1,
    currentStepTitle: "Routing",
    progressPercent: 40,
  };
  return { ...base, ...overrides };
}

const NOTHING_SPECIFIC: MotivationInput = {
  focus: null,
  goalRows: [],
  recommendationCount: 0,
  completedThisWeek: 0,
  streakDays: 0,
  totalVideos: 0,
};

describe("motivationSlot (the 6-hour rotation)", () => {
  it("returns the same slot for every moment inside one 6-hour window", () => {
    const start = new Date("2026-06-29T00:00:00.000Z").getTime();
    const slots = [
      start,
      start + 60 * 1000,
      start + MOTIVATION_ROTATION_MS - 1,
    ].map((ms) => motivationSlot(new Date(ms)));
    assert.equal(new Set(slots).size, 1);
  });

  it("moves to the next slot exactly at the 6-hour boundary", () => {
    const start = new Date("2026-06-29T00:00:00.000Z").getTime();
    const before = motivationSlot(new Date(start + MOTIVATION_ROTATION_MS - 1));
    const after = motivationSlot(new Date(start + MOTIVATION_ROTATION_MS));
    assert.equal(after, before + 1);
  });

  it("changes the message across a boundary rather than freezing on one line", () => {
    const t0 = new Date("2026-06-29T00:00:00.000Z");
    const headlines = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      const when = new Date(t0.getTime() + i * MOTIVATION_ROTATION_MS);
      headlines.add(buildMotivationMessage(NOTHING_SPECIFIC, when).headline);
    }
    // Several distinct generic lines should have appeared over 48 hours.
    assert.ok(headlines.size > 4, `only ${headlines.size} distinct headlines`);
  });
});

describe("msUntilNextRotation", () => {
  it("is never zero and never longer than one full window", () => {
    for (let i = 0; i < 20; i += 1) {
      // Evaluate at points deliberately placed across a window.
      const when = new Date(new Date("2026-06-29T00:00:00.000Z").getTime() + i * 17 * 60 * 1000);
      const remaining = msUntilNextRotation(when);
      assert.ok(remaining > 0, `remaining was ${remaining}`);
      assert.ok(remaining <= MOTIVATION_ROTATION_MS, `remaining was ${remaining}`);
    }
  });

  it("lands on the boundary it claims to", () => {
    const when = new Date("2026-06-29T02:00:00.000Z");
    const next = new Date(when.getTime() + msUntilNextRotation(when));
    assert.equal(motivationSlot(next), motivationSlot(when) + 1);
  });
});

describe("buildMotivationMessage priority", () => {
  const base: MotivationInput = { ...NOTHING_SPECIFIC, totalVideos: 10 };

  it("leads with an overdue goal above everything else", () => {
    const message = buildMotivationMessage({
      ...base,
      goalRows: [
        { title: "Ship the course", status: "overdue", daysRemaining: 0, videosRemaining: 4 },
        { title: "Behind one", status: "behind", daysRemaining: 2, videosRemaining: 6 },
      ],
      streakDays: 30,
      focus: focusRow(),
    });
    assert.equal(message.kind, "status");
    assert.match(message.headline, /Ship the course/);
    assert.match(message.headline, /past its target date/);
  });

  it("reports behind pace when nothing is overdue", () => {
    const message = buildMotivationMessage({
      ...base,
      goalRows: [{ title: "React deep dive", status: "behind", daysRemaining: 4, videosRemaining: 8 }],
      streakDays: 30,
    });
    assert.match(message.headline, /behind pace/i);
    assert.match(message.headline, /React deep dive/);
    // 8 videos over 4 days => 2/day, which must appear in the detail.
    assert.match(message.detail ?? "", /2 a day/);
  });

  it("celebrates a streak once no goal needs attention", () => {
    const message = buildMotivationMessage({ ...base, streakDays: 5 });
    assert.match(message.headline, /5-day streak/);
  });

  it("reports the current roadmap step when there is no streak or goal", () => {
    const message = buildMotivationMessage({ ...base, focus: focusRow() });
    assert.match(message.headline, /step 2 of 5/);
    assert.match(message.headline, /React/);
    assert.match(message.detail ?? "", /Routing/);
  });

  it("never shows a raw category id, because it only reads categoryName", () => {
    const message = buildMotivationMessage({
      ...base,
      focus: focusRow({ categoryId: "kR3nT8xQ2p", categoryName: "React" }),
    });
    assert.ok(!message.headline.includes("kR3nT8xQ2p"));
    assert.ok(!(message.detail ?? "").includes("kR3nT8xQ2p"));
  });

  it("falls back to generic encouragement for a brand-new user", () => {
    const message = buildMotivationMessage(NOTHING_SPECIFIC);
    assert.equal(message.kind, "encouragement");
    assert.ok(message.headline.length > 0);
  });
});
