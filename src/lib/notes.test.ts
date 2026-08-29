import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeNoteContent } from "@/lib/noteUtils";

describe("private note helpers", () => {
  it("trims blank space and preserves meaningful content", () => {
    assert.equal(normalizeNoteContent("  Keep this idea  "), "Keep this idea");
    assert.equal(normalizeNoteContent("\n \t  "), "");
  });
});
