import type { AppNotification } from "@/types";

/**
 * Pure helpers behind the notification bell. Kept separate from
 * src/lib/firestore/notifications.ts so the ordering/badge/count logic can be
 * unit-tested without a Firestore instance (same split as goalUtils vs
 * firestore/goals).
 */

/** Newest first. Firestore orders by createdAt desc for us, but a locally
 *  created/optimistic notification (or the test fixture in the manual test
 *  plan) may not be in order, so the sort is applied here too. */
export function sortNotifications(notifications: AppNotification[]): AppNotification[] {
  return [...notifications].sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

export function countUnread(notifications: Array<Pick<AppNotification, "read">>): number {
  return notifications.reduce((total, n) => (n.read ? total : total + 1), 0);
}

/** How many notifications the bell dropdown shows before the "View all" link.
 *  Small on purpose — the dropdown is a glance, not an inbox page. */
export const RECENT_NOTIFICATION_LIMIT = 8;

export function recentNotifications(
  notifications: AppNotification[],
  limit: number = RECENT_NOTIFICATION_LIMIT
): AppNotification[] {
  return sortNotifications(notifications).slice(0, limit);
}

/** 9+ rather than an ever-widening pill, so the badge stays a fixed size. */
export function formatUnreadBadge(count: number): string {
  return count > 9 ? "9+" : String(count);
}

export function relativeTimeLabel(createdAt: AppNotification["createdAt"], now: Date = new Date()): string {
  const millis = timestampMillis(createdAt);
  if (!millis) return "";

  const seconds = Math.max(0, Math.floor((now.getTime() - millis) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Date(millis).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
