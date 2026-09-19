import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeActiveUserCounts, computeSignupsPerDay } from "./adminAnalytics";
import type { UserProfile } from "@/types";

const NOW = new Date("2026-09-19T12:00:00Z");

function fakeTimestamp(iso: string) {
  const ms = new Date(iso).getTime();
  return { toMillis: () => ms } as any;
}

function fakeUser(overrides: Partial<UserProfile>): UserProfile {
  return {
    uid: "u1",
    email: "test@example.com",
    displayName: "Test User",
    role: "student",
    status: "active",
    createdAt: fakeTimestamp("2026-01-01T00:00:00Z"),
    lastActiveAt: null,
    ...overrides,
  } as UserProfile;
}

describe("computeActiveUserCounts", () => {
  it("counts a user active today in every bucket (cumulative, not exclusive)", () => {
    const users = [fakeUser({ uid: "a", lastActiveAt: fakeTimestamp("2026-09-19T10:00:00Z") })];
    const result = computeActiveUserCounts(users, NOW);
    assert.equal(result.activeToday, 1);
    assert.equal(result.activeThisWeek, 1);
    assert.equal(result.activeThisMonth, 1);
  });

  it("does not count a user active 10 days ago as active today or this week", () => {
    const users = [fakeUser({ uid: "a", lastActiveAt: fakeTimestamp("2026-09-09T12:00:00Z") })];
    const result = computeActiveUserCounts(users, NOW);
    assert.equal(result.activeToday, 0);
    assert.equal(result.activeThisWeek, 0);
    assert.equal(result.activeThisMonth, 1);
  });

  it("counts a null lastActiveAt as never logged in, not active", () => {
    const users = [fakeUser({ uid: "a", lastActiveAt: null })];
    const result = computeActiveUserCounts(users, NOW);
    assert.equal(result.neverLoggedIn, 1);
    assert.equal(result.activeToday, 0);
  });

  it("handles the exact 24-hour boundary as still active today (inclusive)", () => {
    const users = [fakeUser({ uid: "a", lastActiveAt: fakeTimestamp("2026-09-18T12:00:00Z") })];
    const result = computeActiveUserCounts(users, NOW);
    assert.equal(result.activeToday, 1);
  });

  it("splits role and status counts correctly", () => {
    const users = [
      fakeUser({ uid: "a", role: "admin", status: "active" }),
      fakeUser({ uid: "b", role: "student", status: "disabled" }),
      fakeUser({ uid: "c", role: "student", status: "active" }),
    ];
    const result = computeActiveUserCounts(users, NOW);
    assert.equal(result.adminCount, 1);
    assert.equal(result.studentCount, 2);
    assert.equal(result.disabledCount, 1);
    assert.equal(result.totalUsers, 3);
  });
});

describe("computeSignupsPerDay", () => {
  it("includes zero-count days rather than skipping them", () => {
    const result = computeSignupsPerDay([], 7, NOW);
    assert.equal(result.length, 7);
    assert.ok(result.every((d) => d.count === 0));
  });

  it("buckets a signup on the correct day", () => {
    const users = [fakeUser({ uid: "a", createdAt: fakeTimestamp("2026-09-15T08:00:00Z") })];
    const result = computeSignupsPerDay(users, 7, NOW);
    const day = result.find((d) => d.date === "2026-09-15");
    assert.ok(day);
    assert.equal(day!.count, 1);
  });

  it("ignores a signup outside the requested window", () => {
    const users = [fakeUser({ uid: "a", createdAt: fakeTimestamp("2026-01-01T00:00:00Z") })];
    const result = computeSignupsPerDay(users, 7, NOW);
    const total = result.reduce((sum, d) => sum + d.count, 0);
    assert.equal(total, 0);
  });
});
