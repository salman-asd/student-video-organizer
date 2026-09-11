import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { maskApiKey } from "./server/aiEncryption";
import { validateCreateInput, validateUpdateInput } from "./server/aiConnections";
import { cleanTranscript } from "./ai/transcript";

describe("AI credential safety", () => {
  it("returns only a short masked suffix", () => {
    const key = "sk-live-example-secret";
    const masked = maskApiKey(key);

    assert.equal(masked, "••••••••cret");
    assert.notEqual(masked, key);
    assert.equal(masked.includes(key), false);
  });

  it("accepts supported providers without exposing credential data", () => {
    const result = validateCreateInput({
      provider: "anthropic",
      apiKey: "sk-ant-example",
      model: "claude-3-5-sonnet-latest",
      label: "Backup",
    });

    assert.equal(result, null);
  });

  it("accepts OpenRouter as a configured provider", () => {
    assert.equal(validateCreateInput({
      provider: "openrouter",
      apiKey: "sk-or-example",
      model: "meta-llama/llama-3.1-8b-instruct:free",
      label: "Free fallback",
    }), null);
  });

  it("accepts Groq as a configured provider", () => {
    assert.equal(validateCreateInput({
      provider: "groq",
      apiKey: "gsk-example",
      model: "llama-3.3-70b-versatile",
      label: "Groq fallback",
    }), null);
  });

  it("cleans transcript whitespace and removes stage directions", () => {
    assert.equal(cleanTranscript(" Hello   world [music]  from captions "), "Hello world from captions");
  });

  it("rejects non-finite priorities", () => {
    assert.equal(validateUpdateInput({ priority: Number.NaN }), "priority must be a finite number.");
    assert.equal(validateUpdateInput({ priority: Number.POSITIVE_INFINITY }), "priority must be a finite number.");
  });
});
