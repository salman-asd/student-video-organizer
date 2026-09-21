import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { friendlyAuthError, friendlyChangePasswordError } from "./authErrors";
import { RESEND_COOLDOWN_MS, resendCooldownRemaining, shouldBlockUnverified, validateNewPassword } from "./emailVerification";

describe("shouldBlockUnverified", () => {
  it("never blocks verified users (Google, or password users who clicked the link)", () => {
    assert.equal(shouldBlockUnverified({ emailVerified: true, hasProfile: false }), false);
    assert.equal(shouldBlockUnverified({ emailVerified: true, hasProfile: true }), false);
  });
  it("blocks new, unverified sign-ups (no profile yet)", () => {
    assert.equal(shouldBlockUnverified({ emailVerified: false, hasProfile: false }), true);
  });
  it("grandfathers existing unverified accounts that already have a profile", () => {
    assert.equal(shouldBlockUnverified({ emailVerified: false, hasProfile: true }), false);
  });
});

describe("resendCooldownRemaining", () => {
  it("is 0 when nothing was sent yet", () => assert.equal(resendCooldownRemaining(0, 1_000_000), 0));
  it("counts down and reaches 0", () => {
    const sent = 1_000_000;
    assert.equal(resendCooldownRemaining(sent, sent + 10_000), RESEND_COOLDOWN_MS - 10_000);
    assert.equal(resendCooldownRemaining(sent, sent + RESEND_COOLDOWN_MS), 0);
    assert.equal(resendCooldownRemaining(sent, sent + RESEND_COOLDOWN_MS + 5_000), 0);
  });
});

describe("validateNewPassword", () => {
  it("accepts a valid change", () => assert.equal(validateNewPassword("old-pass", "new-pass-1", "new-pass-1"), null));
  it("requires the current password", () => assert.match(validateNewPassword("", "abcdef", "abcdef")!, /current password/i));
  it("enforces the minimum length", () => assert.match(validateNewPassword("old-pass", "abc", "abc")!, /at least 6/));
  it("rejects reusing the current password", () => assert.match(validateNewPassword("samepass", "samepass", "samepass")!, /different/));
  it("requires the confirmation to match", () => assert.match(validateNewPassword("old-pass", "new-pass-1", "new-pass-2")!, /don't match/));
});

describe("friendly auth errors", () => {
  it("maps known codes and falls back safely", () => {
    assert.match(friendlyAuthError("auth/too-many-requests"), /wait/i);
    assert.match(friendlyAuthError("auth/invalid-credential"), /don't match/);
    assert.match(friendlyAuthError("auth/something-new"), /try again/i);
    assert.match(friendlyAuthError(undefined), /try again/i);
  });
  it("says the CURRENT password is wrong in the change-password form", () => {
    assert.match(friendlyChangePasswordError("auth/invalid-credential"), /current password is incorrect/i);
    assert.match(friendlyChangePasswordError("auth/weak-password"), /6 characters/);
  });
});
