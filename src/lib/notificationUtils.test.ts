import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RECENT_NOTIFICATION_LIMIT,
  countUnread,
  formatUnreadBadge,
  recentNotifications,
  relativeTimeLabel,
  sortNotifications,
} from "./notificationUtils";

function notification(id: string, read: boolean, createdAt: string, overrides: Record<string, unknown> = {}) {
  return { id, read, createdAt: { toDate: () => new Date(createdAt) }, type: "goal_pace", title: id, body: "", ...overrides } as any;
}

describe("sortNotifications", () => {
  it("orders newest first", () => {
    const sorted = sortNotifications([
      notification("old", true, "2026-01-01T00:00:00.000Z"),
      notification("new", true, "2026-03-01T00:00:00.000Z"),
      notification("mid", true, "2026-02-01T00:00:00.000Z"),
    ]);
    assert.deepEqual(sorted.map((n) => n.id), ["new", "mid", "old"]);
  });

  it("does not mutate the input array", () => {
    const input = [
      notification("a", true, "2026-01-01T00:00:00.000Z"),
      notification("b", true, "2026-02-01T00:00:00.000Z"),
    ];
    sortNotifications(input);
    assert.deepEqual(input.map((n) => n.id), ["a", "b"]);
  });

  it("treats a null createdAt as oldest rather than throwing", () => {
    const sorted = sortNotifications([
      { id: "no-date", read: true, createdAt: null } as any,
      notification("dated", true, "2026-01-01T00:00:00.000Z"),
    ]);
    assert.deepEqual(sorted.map((n) => n.id), ["dated", "no-date"]);
  });
});

describe("countUnread", () => {
  it("counts only unread notifications", () => {
    assert.equal(countUnread([{ read: false }, { read: true }, { read: false }]), 2);
  });

  it("returns 0 for an empty list", () => {
    assert.equal(countUnread([]), 0);
  });
});

describe("recentNotifications", () => {
  it("caps the list at the recent limit, newest first", () => {
    const items = Array.from({ length: RECENT_NOTIFICATION_LIMIT + 5 }, (_, i) =>
      notification(`n${i}`, true, new Date(Date.UTC(2026, 0, 1 + i)).toISOString())
    );

    const recent = recentNotifications(items);
    assert.equal(recent.length, RECENT_NOTIFICATION_LIMIT);
    assert.equal(recent[0].id, `n${RECENT_NOTIFICATION_LIMIT + 4}`);
  });
});

describe("formatUnreadBadge", () => {
  it("shows exact counts up to 9", () => {
    assert.equal(formatUnreadBadge(1), "1");
    assert.equal(formatUnreadBadge(9), "9");
  });

  it("caps at 9+ so the badge keeps a fixed width", () => {
    assert.equal(formatUnreadBadge(10), "9+");
    assert.equal(formatUnreadBadge(250), "9+");
  });
});

describe("relativeTimeLabel", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("uses coarse buckets instead of exact timestamps", () => {
    assert.equal(relativeTimeLabel({ toDate: () => new Date("2026-06-15T11:59:30.000Z") } as any, now), "just now");
    assert.equal(relativeTimeLabel({ toDate: () => new Date("2026-06-15T11:30:00.000Z") } as any, now), "30m ago");
    assert.equal(relativeTimeLabel({ toDate: () => new Date("2026-06-15T06:00:00.000Z") } as any, now), "6h ago");
    assert.equal(relativeTimeLabel({ toDate: () => new Date("2026-06-13T12:00:00.000Z") } as any, now), "2d ago");
    assert.equal(relativeTimeLabel({ toDate: () => new Date("2026-06-01T12:00:00.000Z") } as any, now), "2w ago");
  });

  it("returns an empty label rather than 'Invalid Date' for a missing timestamp", () => {
    assert.equal(relativeTimeLabel(null, now), "");
  });
});
