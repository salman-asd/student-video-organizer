import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDefaultQuota, consumeQuotaState, validateQuotaOverrideInput, validateSystemDefaultsInput } from "./aiQuota";

describe("AI quota helpers", () => {
  it("builds a default quota for a user with the platform limit", () => {
    const quota = buildDefaultQuota({ defaultDailyLimit: 7 });
    assert.equal(quota.dailyLimit, 7);
    assert.equal(quota.usedToday, 0);
    assert.equal(quota.systemAiEnabled, true);
  });

  it("resets stale dates and allows the first call on the new day", () => {
    const quota = { dailyLimit: 2, usedToday: 2, date: "2024-01-01", systemAiEnabled: true };
    const result = consumeQuotaState(quota, "2024-01-02");
    assert.equal(result.allowed, true);
    assert.equal(result.next.usedToday, 1);
    assert.equal(result.next.date, "2024-01-02");
  });

  it("allows the first use inside the limit and increments the counter", () => {
    const quota = { dailyLimit: 3, usedToday: 1, date: "2024-01-02", systemAiEnabled: true };
    const result = consumeQuotaState(quota, "2024-01-02");
    assert.equal(result.allowed, true);
    assert.equal(result.next.usedToday, 2);
  });

  it("accepts valid quota overrides and rejects invalid admin inputs", () => {
    assert.equal(validateQuotaOverrideInput({ dailyLimit: 3, systemAiEnabled: false }), null);
    assert.match(validateQuotaOverrideInput({ dailyLimit: -1 }) || "", /dailyLimit must be a non-negative number/i);
    assert.match(validateQuotaOverrideInput({ systemAiEnabled: "yes" }) || "", /systemAiEnabled must be a boolean/i);
  });

  it("validates the platform-wide daily limit defaults", () => {
    assert.equal(validateSystemDefaultsInput({ defaultDailyLimit: 7 }), null);
    assert.match(validateSystemDefaultsInput({ defaultDailyLimit: -2 }) || "", /defaultDailyLimit must be a non-negative number/i);
  });
});
