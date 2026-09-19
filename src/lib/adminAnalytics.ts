import type { UserProfile } from "@/types";

/**
 * Pure aggregation over an already-fetched user list — deliberately NOT a
 * Firestore query of its own. The admin dashboard reuses the exact same
 * listUsers() fetch the All Users page already makes, so this stays free
 * on top of that (no new reads), and stays a plain function that's easy to
 * unit test without spinning up Firebase at all.
 */

export interface ActiveUserCounts {
  totalUsers: number;
  activeToday: number;
  activeThisWeek: number;
  activeThisMonth: number;
  neverLoggedIn: number;
  adminCount: number;
  studentCount: number;
  disabledCount: number;
}

function toMillis(t: unknown): number | null {
  if (!t) return null;
  if (typeof (t as any).toMillis === "function") return (t as any).toMillis();
  if (typeof (t as any).seconds === "number") return (t as any).seconds * 1000;
  return null;
}

/**
 * Buckets are cumulative (activeToday is a subset of activeThisWeek, which
 * is a subset of activeThisMonth) — this matches how most dashboards read
 * "active this week" (documented explicitly since the alternative,
 * mutually-exclusive buckets, is an equally valid choice and the two are
 * easy to conflate when reading the numbers later).
 */
export function computeActiveUserCounts(users: UserProfile[], now: Date = new Date()): ActiveUserCounts {
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  let activeToday = 0;
  let activeThisWeek = 0;
  let activeThisMonth = 0;
  let neverLoggedIn = 0;
  let adminCount = 0;
  let studentCount = 0;
  let disabledCount = 0;

  for (const u of users) {
    const lastActiveMs = toMillis(u.lastActiveAt);
    if (lastActiveMs === null) {
      neverLoggedIn++;
    } else {
      const ageMs = nowMs - lastActiveMs;
      if (ageMs <= dayMs) activeToday++;
      if (ageMs <= 7 * dayMs) activeThisWeek++;
      if (ageMs <= 30 * dayMs) activeThisMonth++;
    }
    if (u.role === "admin") adminCount++;
    else studentCount++;
    if (u.status === "disabled") disabledCount++;
  }

  return {
    totalUsers: users.length,
    activeToday,
    activeThisWeek,
    activeThisMonth,
    neverLoggedIn,
    adminCount,
    studentCount,
    disabledCount,
  };
}

export interface SignupsPerDay {
  date: string; // yyyy-mm-dd
  count: number;
}

/** Signups per day over the trailing `days` window, oldest first — for a
 *  simple trend chart. Days with zero signups are included (as 0), not
 *  skipped, so the chart's x-axis stays evenly spaced. */
export function computeSignupsPerDay(users: UserProfile[], days: number = 30, now: Date = new Date()): SignupsPerDay[] {
  const buckets = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const u of users) {
    const ms = toMillis(u.createdAt);
    if (ms === null) continue;
    const key = new Date(ms).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}
