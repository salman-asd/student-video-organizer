import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canManageShare, canReadSharedItem, isShareRevoked, resolveShareVisibilityState, type ShareAccessContext } from "./sharing";

describe("share access rules", () => {
  const base: ShareAccessContext = {
    ownerUid: "owner-1",
    visibility: "private",
    revokedAt: null,
    token: "abc123def456ghi789jkl012mno345",
  };

  it("allows owner access to private shares", () => {
    assert.equal(canReadSharedItem(base, "owner-1"), true);
  });

  it("allows public access", () => {
    assert.equal(canReadSharedItem({ ...base, visibility: "public" }, "viewer-2"), true);
  });

  it("allows anyone-with-link access for unlisted shares", () => {
    assert.equal(canReadSharedItem({ ...base, visibility: "unlisted" }, "viewer-3"), true);
  });

  it("blocks private access to non-owners", () => {
    assert.equal(canReadSharedItem(base, "viewer-4"), false);
  });

  it("blocks revoked shares", () => {
    const revoked = { ...base, revokedAt: new Date("2024-01-01T00:00:00Z") };
    assert.equal(canReadSharedItem(revoked, "viewer-5"), false);
    assert.equal(isShareRevoked(revoked), true);
  });

  it("rejects invalid tokens", () => {
    assert.equal(canReadSharedItem({ ...base, token: "" }, "viewer-6"), false);
    assert.equal(canReadSharedItem({ ...base, token: "short" }, "viewer-6"), false);
  });

  it("prevents unauthorized modification", () => {
    assert.equal(canManageShare(base, "viewer-7"), false);
    assert.equal(canManageShare({ ...base, ownerUid: "owner-1" }, "owner-1"), true);
  });

  it("keeps private visibility separate from an explicit revoke", () => {
    const privateShare = resolveShareVisibilityState(null, "private", false);
    assert.equal(privateShare.visibility, "private");
    assert.equal(privateShare.revokedAt, null);

    const reenabled = resolveShareVisibilityState(new Date("2024-01-01T00:00:00Z"), "unlisted", false);
    assert.equal(reenabled.visibility, "unlisted");
    assert.equal(reenabled.revokedAt, null);

    const revoked = resolveShareVisibilityState(null, "private", true);
    assert.equal(revoked.visibility, "private");
    assert.equal(revoked.revokedAt instanceof Date, true);
  });
});
