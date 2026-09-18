import { computeDailyPace, getGoalLinkedPlaylists, getGoalLinkedVideos, type DailyPaceSummary } from "@/lib/goalUtils";
import type { Goal } from "@/types";

/**
 * Behind-pace detection for goal notifications (Phase C4).
 *
 * Kept pure and separate from the dashboard so "is this goal meaningfully
 * behind?" is unit-testable, and so the threshold can be tuned in one place.
 */

/** A goal must have linked content to have a meaningful pace at all — a goal
 *  with nothing attached has videosRemaining 0 and would otherwise read as
 *  "ahead" forever. */
function hasTrackableContent(goal: Goal): boolean {
  return getGoalLinkedPlaylists(goal).length > 0 || getGoalLinkedVideos(goal).length > 0;
}

export interface BehindPaceEntry {
  goal: Goal;
  pace: DailyPaceSummary;
  /**
   * How many days' worth of the required pace the user is short. Positive
   * means behind. This is the "meaningfully behind" measure: 0.3 means they're
   * a third of a day's work behind (noise), 2.5 means two and a half days
   * behind (worth telling them about).
   */
  daysBehind: number;
}

export interface BehindPaceOptions {
  /**
   * Minimum days-behind before a notification fires. Default 1.
   *
   * The spec's "more than 1 day's worth of required pace behind" — chosen
   * over a plain "status === behind" test because computeDailyPace marks a
   * goal behind the moment its required pace edges above 1 video/day, which
   * happens for a day or two of ordinary slippage. Notifying there would fire
   * constantly and train the user to ignore the bell.
   *
   * Deliberately NOT re-derived from an assumed start date: we don't store
   * when a goal was created relative to its target, and inventing an expected
   * baseline from `createdAt` would penalize a goal created yesterday for a
   * deadline tomorrow. Requiring the *remaining* work itself to be more than
   * one day behind schedule is a defensible reading of the same intent and
   * needs no extra data.
   */
  minDaysBehind?: number;
}

/**
 * Returns the goals that are meaningfully behind pace, worst first.
 * Completed goals, goals without a target date, and goals with nothing linked
 * are all skipped — none of them can be "behind" in a way a notification
 * could help with.
 */
export function findGoalsBehindPace(
  goals: Goal[],
  allVideos: Array<{ id: string; playlistId?: string | null; status?: string | null }>,
  now: Date = new Date(),
  options: BehindPaceOptions = {}
): BehindPaceEntry[] {
  const minDaysBehind = options.minDaysBehind ?? 1;

  return (goals ?? [])
    .filter((goal) => !goal.completed && !!goal.targetDate && hasTrackableContent(goal))
    .map((goal) => {
      const pace = computeDailyPace(goal, allVideos, now);
      return { goal, pace, ...measureBehind(pace) };
    })
    .filter((entry) => entry.daysBehind > minDaysBehind)
    .sort((a, b) => b.daysBehind - a.daysBehind);
}

/**
 * Work still outstanding, expressed in days at the required rate.
 *
 * "overdue" is reported as at least its remaining video count — a goal whose
 * deadline has passed with N videos left is N days' worth of work short by
 * the plainest reading, since there are no days left to spread N over.
 */
function measureBehind(pace: DailyPaceSummary): { daysBehind: number } {
  if (pace.status === "overdue") return { daysBehind: pace.videosRemaining };
  if (pace.status !== "behind") return { daysBehind: 0 };
  if (pace.daysRemaining <= 0) return { daysBehind: pace.videosRemaining };

  const requiredPerDay = pace.videosRemaining / pace.daysRemaining;
  return { daysBehind: requiredPerDay - 1 };
}

/** Human-readable body for the notification. */
export function paceNotificationCopy(entry: BehindPaceEntry): string {
  const { goal, pace, daysBehind } = entry;
  const videos = `${pace.videosRemaining} video${pace.videosRemaining === 1 ? "" : "s"}`;

  if (pace.status === "overdue") {
    return `Your deadline has passed with ${videos} still to watch. Pick it back up, or move the target date.`;
  }

  const days = pace.daysRemaining;
  return `${videos} left and ${days} day${days === 1 ? "" : "s"} to go — about ${pace.videosPerDayNeeded}/day. You're roughly ${formatDays(daysBehind)} behind.`;
}

function formatDays(daysBehind: number): string {
  const days = Math.round(daysBehind * 10) / 10;
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;
  return `${Math.max(1, Math.round(daysBehind * 24))} hours`;
}

/**
 * Stable identity for "we already warned about this goal".
 *
 * Built from the notification's linkHref (which carries the goal id) so it
 * needs no schema change and works for notifications written before this
 * helper existed. Callers pass the same href shape
 * (`/goals?goal=<id>`) both when writing and when de-duplicating.
 */
export function goalPaceMarker(linkHref: string | null | undefined): string {
  if (!linkHref) return "";
  const match = String(linkHref).match(/goal=([^&]+)/);
  return match ? `goal_pace:${decodeURIComponent(match[1])}` : `goal_pace:${String(linkHref)}`;
}
