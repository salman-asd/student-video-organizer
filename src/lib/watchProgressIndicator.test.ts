import test from "node:test";
import assert from "node:assert/strict";

import { getWatchProgressIndicator } from "./watchProgressIndicator";

test("returns no indicator for unstarted videos", () => {
  const result = getWatchProgressIndicator(0);

  assert.equal(result.state, "none");
  assert.equal(result.percent, 0);
});

test("returns a partial progress indicator for in-progress videos", () => {
  const result = getWatchProgressIndicator(42);

  assert.equal(result.state, "partial");
  assert.equal(result.percent, 42);
  assert.match(result.label, /42%/);
});

test("returns a complete state with a green check for finished videos", () => {
  const result = getWatchProgressIndicator(100);

  assert.equal(result.state, "complete");
  assert.equal(result.percent, 100);
  assert.equal(result.icon, "check");
});
