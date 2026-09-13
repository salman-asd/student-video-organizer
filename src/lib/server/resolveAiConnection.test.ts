import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { withAiConnection } from "./resolveAiConnection";
import { AiServiceError } from "../ai/errors";

describe("withAiConnection", () => {
  it("falls through to the system tier when personal connections are unavailable and quota allows it", async () => {
    const result = await withAiConnection(
      "uid-1",
      async (apiKey, provider, model) => {
        assert.equal(apiKey, "system-secret");
        assert.equal(provider, "gemini");
        assert.equal(model, "gemini-2.0-flash");
        return "ok";
      },
      {
        getPersonalConnectionRaw: async () => null,
        getSystemConnectionRaw: async () => ({
          id: "system-1",
          provider: "gemini",
          encryptedApiKey: "encrypted",
          maskedKey: "••••",
          model: "gemini-2.0-flash",
          label: "System",
          priority: 0,
          isActive: true,
          status: "active",
          cooldownUntil: null,
          lastUsedAt: null,
          lastSuccessAt: null,
          lastFailureAt: null,
          createdAt: null,
          updatedAt: null,
        }),
        consumeQuota: async () => true,
        decryptApiKey: () => "system-secret",
        recordPersonalTestResult: async () => undefined,
        recordPersonalConnectionFailure: async () => undefined,
        recordSystemTestResult: async () => undefined,
        recordSystemConnectionFailure: async () => undefined,
      }
    );

    assert.equal(result, "ok");
  });

  it("throws a friendly quota error when the system tier is allowed to run out", async () => {
    await assert.rejects(
      () =>
        withAiConnection("uid-2", async () => "unused", {
          getPersonalConnectionRaw: async () => null,
          getSystemConnectionRaw: async () => null,
          consumeQuota: async () => false,
          decryptApiKey: () => "unused",
          recordPersonalTestResult: async () => undefined,
          recordPersonalConnectionFailure: async () => undefined,
          recordSystemTestResult: async () => undefined,
          recordSystemConnectionFailure: async () => undefined,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AiServiceError);
        assert.match(error.message, /Add your own API key in Settings|ask an admin for more quota/i);
        return true;
      }
    );
  });
});
