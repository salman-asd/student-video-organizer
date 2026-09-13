import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateCreateInput, validateUpdateInput } from "./systemAiConnections";

describe("System AI connection validation", () => {
  it("accepts a valid system connection payload", () => {
    assert.equal(
      validateCreateInput({
        provider: "gemini",
        apiKey: "AIza-test-key",
        model: "gemini-2.0-flash",
        label: "System default",
      }),
      null
    );
  });

  it("rejects non-finite priorities during updates", () => {
    assert.equal(validateUpdateInput({ priority: Number.NaN }), "priority must be a finite number.");
    assert.equal(validateUpdateInput({ priority: Number.POSITIVE_INFINITY }), "priority must be a finite number.");
  });
});
