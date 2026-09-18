import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_GROUP_LAYOUT,
  PACKED_VIDEO_COUNT,
  cardClassFor,
  gridClassFor,
  hiddenCountFor,
  isGroupLayout,
  visibleVideosFor,
} from "./continueLearningLayout";

const SIX_VIDEOS = ["v1", "v2", "v3", "v4", "v5", "v6"];

describe("packed state (the stacked-card view)", () => {
  it("shows exactly one video — the first — for a 6-video playlist", () => {
    // The requirement: a packed group shows the FIRST video's thumbnail plus a
    // count, not a cluster of every thumbnail.
    const visible = visibleVideosFor(SIX_VIDEOS, "packed");
    assert.deepEqual(visible, ["v1"]);
    assert.equal(visible.length, PACKED_VIDEO_COUNT);
  });

  it("is the default layout", () => {
    assert.equal(DEFAULT_GROUP_LAYOUT, "packed");
  });

  it("reports how many videos it represents", () => {
    assert.equal(hiddenCountFor(6, "packed"), 5);
  });

  it("never reports a negative count for a single-video group", () => {
    assert.equal(hiddenCountFor(1, "packed"), 0);
    assert.equal(hiddenCountFor(0, "packed"), 0);
  });
});

describe("row and wrap states", () => {
  it("shows every video in single-row mode", () => {
    assert.deepEqual(visibleVideosFor(SIX_VIDEOS, "row"), SIX_VIDEOS);
  });

  it("shows every video in wrapped mode", () => {
    assert.deepEqual(visibleVideosFor(SIX_VIDEOS, "wrap"), SIX_VIDEOS);
  });

  it("hides nothing once expanded, in either expanded state", () => {
    assert.equal(hiddenCountFor(6, "row"), 0);
    assert.equal(hiddenCountFor(6, "wrap"), 0);
  });
});

describe("gridClassFor", () => {
  it("lays the single-row layout out as a horizontally scrolling flex row", () => {
    const cls = gridClassFor("row");
    assert.ok(cls.includes("overflow-x-auto"));
    assert.ok(cls.includes("snap-x"));
  });

  it("lays the wrapped layout out as a wrapping flex container", () => {
    const cls = gridClassFor("wrap");
    assert.ok(cls.includes("flex-wrap"));
    // Must NOT scroll horizontally — that's what "wrap" means.
    assert.ok(!cls.includes("overflow-x-auto"));
  });

  it("does not constrain the packed container's width", () => {
    // The width cap belongs on the card (see cardClassFor), not the wrapper —
    // otherwise the stacked shadow panels would be clipped.
    assert.ok(!gridClassFor("packed").includes("overflow-x-auto"));
  });
});

describe("cardClassFor", () => {
  it("gives a narrow fixed width to the packed card", () => {
    const cls = cardClassFor("packed");
    assert.ok(cls.includes("w-[190px]"));
    assert.ok(cls.includes("shrink-0"));
  });

  it("gives an explicit width to row cards so flex cannot shrink them", () => {
    // Without a fixed width, flex shrinks every card to fit and the horizontal
    // scrolling the layout exists for never happens.
    const cls = cardClassFor("row");
    assert.ok(cls.includes("shrink-0"));
    assert.ok(cls.includes("snap-start"));
  });

  it("gives wrap cards the same width so rows line up", () => {
    assert.equal(cardClassFor("wrap"), cardClassFor("row").replace(" snap-start", ""));
  });
});

describe("isGroupLayout", () => {
  it("accepts the three valid states", () => {
    assert.equal(isGroupLayout("packed"), true);
    assert.equal(isGroupLayout("row"), true);
    assert.equal(isGroupLayout("wrap"), true);
  });

  it("rejects anything else, including the retired state names", () => {
    assert.equal(isGroupLayout("single"), false);
    assert.equal(isGroupLayout("wrapped"), false);
    assert.equal(isGroupLayout(null), false);
    assert.equal(isGroupLayout(undefined), false);
  });
});
