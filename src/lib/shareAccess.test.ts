import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canManageShare, canReadSharedItem, computeExpiresAt, isShareExpired, isShareRevoked,
  resolveShareVisibilityState, shareExpiryOptionFromDate, type ShareAccessContext,
} from "./sharing";

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

describe("share expiry", () => {
  const base: ShareAccessContext = {
    ownerUid: "owner-1",
    visibility: "unlisted",
    revokedAt: null,
    token: "abc123def456ghi789jkl012mno345",
  };

  it("treats a missing/null expiresAt as never-expiring", () => {
    assert.equal(isShareExpired(base), false);
    assert.equal(isShareExpired({ ...base, expiresAt: null }), false);
    assert.equal(canReadSharedItem(base, "viewer-1"), true);
  });

  it("blocks reads once expiresAt is in the past", () => {
    const expired = { ...base, expiresAt: new Date(Date.now() - 60_000) };
    assert.equal(isShareExpired(expired), true);
    assert.equal(canReadSharedItem(expired, "viewer-1"), false);
  });

  it("allows reads while expiresAt is still in the future", () => {
    const active = { ...base, expiresAt: new Date(Date.now() + 60_000) };
    assert.equal(isShareExpired(active), false);
    assert.equal(canReadSharedItem(active, "viewer-1"), true);
  });

  it("computeExpiresAt('never') clears expiry", () => {
    assert.equal(computeExpiresAt("never"), null);
  });

  it("computeExpiresAt('7d'/'30d') adds the right number of days", () => {
    const from = new Date("2024-01-01T00:00:00Z");
    const in7 = computeExpiresAt("7d", from);
    const in30 = computeExpiresAt("30d", from);
    assert.equal(in7?.toISOString(), "2024-01-08T00:00:00.000Z");
    assert.equal(in30?.toISOString(), "2024-01-31T00:00:00.000Z");
  });

  it("shareExpiryOptionFromDate buckets a stored expiry back to an option", () => {
    assert.equal(shareExpiryOptionFromDate(null), "never");
    assert.equal(shareExpiryOptionFromDate(new Date(Date.now() - 1000)), "never");
    assert.equal(shareExpiryOptionFromDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)), "7d");
    assert.equal(shareExpiryOptionFromDate(new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)), "30d");
  });
});
