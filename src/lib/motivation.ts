import type { RoadmapFocusRow } from "@/lib/dashboardUtils";

/**
 * The prominent line at the top of the Dashboard (Phase D).
 *
 * Two flavours, deliberately:
 *
 *  1. REAL-STATUS lines, built from the user's actual position — these win
 *     whenever we have something specific and true to say ("2 days behind on
 *     X"). Generic cheerleading on top of a dashboard full of real numbers
 *     reads as filler and gets tuned out.
 *  2. GENERIC encouragement, used only when there's nothing specific to
 *     report, or nothing set up yet.
 *
 * Rotation is keyed off a coarse time slice rather than a random pick, so the
 * line is stable while you're using the app and only changes on the boundary —
 * a message that reshuffles on every render would be distracting, and one that
 * changes on every navigation would look like a bug.
 */

/** How long a single message stays put. */
export const MOTIVATION_ROTATION_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Coarse, stable bucket index: same value for every render inside the window. */
export function motivationSlot(now: Date = new Date(), rotationMs: number = MOTIVATION_ROTATION_MS): number {
  const ms = Number.isFinite(rotationMs) && rotationMs > 0 ? rotationMs : MOTIVATION_ROTATION_MS;
  return Math.floor(now.getTime() / ms);
}

/** Time remaining before the next rotation — used to schedule a re-render. */
export function msUntilNextRotation(now: Date = new Date(), rotationMs: number = MOTIVATION_ROTATION_MS): number {
  const ms = Number.isFinite(rotationMs) && rotationMs > 0 ? rotationMs : MOTIVATION_ROTATION_MS;
  return ms - (now.getTime() % ms);
}

export interface MotivationMessage {
  headline: string;
  detail?: string;
  /** Which flavour this is — lets the UI style status lines differently from
   *  generic encouragement. */
  kind: "status" | "encouragement";
}

export interface MotivationInput {
  focus: RoadmapFocusRow | null;
  goalRows: Array<{ title: string; status: string; daysRemaining: number; videosRemaining: number }>;
  recommendationCount: number;
  /** Videos finished in the last 7 days. */
  completedThisWeek: number;
  /** Current consecutive-day streak. */
  streakDays: number;
  totalVideos: number;
}

const GENERIC_ENCOURAGEMENT: MotivationMessage[] = [
  { kind: "encouragement", headline: "Small sessions, compounded daily, beat rare marathon ones.", detail: "A video a day is a finished course in a month." },
  { kind: "encouragement", headline: "You don't have to feel ready. You just have to press play.", detail: "Momentum is built, not waited for." },
  { kind: "encouragement", headline: "Progress you can see is progress you keep.", detail: "Your roadmap remembers where you left off." },
  { kind: "encouragement", headline: "Learning is repetition wearing the disguise of skill.", detail: "Rewatch if it didn't stick the first time." },
  { kind: "encouragement", headline: "The hardest video is the first one you open today.", detail: "Everything after it is easier." },
  { kind: "encouragement", headline: "Consistency is a strategy, not a personality trait.", detail: "Show up small. Show up again tomorrow." },
  { kind: "encouragement", headline: "You're not behind. You're early in a long game.", detail: "Keep the streak alive." },
  { kind: "encouragement", headline: "Understanding takes as long as it takes. Start anyway.", detail: "Nobody learned this in one sitting." },
];

/**
 * Picks the message to show right now.
 *
 * Priority order reflects what actually deserves attention: a missed
 * deadline, then behind pace, then an active streak, then a fresh win, then
 * something concrete to watch — and only then generic encouragement.
 */
export function buildMotivationMessage(
  input: MotivationInput,
  now: Date = new Date(),
  rotationMs: number = MOTIVATION_ROTATION_MS
): MotivationMessage {
  const slot = motivationSlot(now, rotationMs);
  const { focus, goalRows, recommendationCount, completedThisWeek, streakDays, totalVideos } = input;

  const overdue = (goalRows ?? []).find((goal) => goal.status === "overdue");
  if (overdue) {
    return {
      kind: "status",
      headline: `"${overdue.title}" is past its target date.`,
      detail: `${overdue.videosRemaining} video${overdue.videosRemaining === 1 ? "" : "s"} still to go — finish it or move the date. Either is fine, stalling isn't.`,
    };
  }

  const behind = (goalRows ?? []).filter((goal) => goal.status === "behind");
  if (behind.length > 0) {
    const worst = behind[0];
    return {
      kind: "status",
      headline: `You're behind pace on "${worst.title}".`,
      detail: `${worst.videosRemaining} videos left in ${worst.daysRemaining} day${worst.daysRemaining === 1 ? "" : "s"} — roughly ${Math.max(1, Math.ceil(worst.videosRemaining / Math.max(1, worst.daysRemaining)))} a day gets you back on track.`,
    };
  }

  if (streakDays >= 3) {
    return {
      kind: "status",
      headline: `${streakDays}-day streak. Don't break the chain today.`,
      detail: "One video is all it takes to keep it.",
    };
  }

  if (completedThisWeek >= 3) {
    return {
      kind: "status",
      headline: `${completedThisWeek} videos finished this week.`,
      detail: fallbackDetail(focus, recommendationCount),
    };
  }

  if (focus && focus.stepCount > 0) {
    return {
      kind: "status",
      headline: `You're on step ${focus.currentStepIndex + 1} of ${focus.stepCount} in ${focus.categoryName}.`,
      detail: `Next up: ${focus.currentStepTitle}`,
    };
  }

  if (totalVideos > 0 && recommendationCount > 0) {
    return {
      kind: "status",
      headline: "We found something worth watching today.",
      detail: `${recommendationCount} pick${recommendationCount === 1 ? "" : "s"} matched to your roadmap below.`,
    };
  }

  // Nothing specific to say: rotate a generic line so it still changes every
  // window rather than freezing on one message forever.
  const index = ((slot % GENERIC_ENCOURAGEMENT.length) + GENERIC_ENCOURAGEMENT.length) % GENERIC_ENCOURAGEMENT.length;
  return GENERIC_ENCOURAGEMENT[index];
}

function fallbackDetail(focus: RoadmapFocusRow | null, recommendationCount: number): string {
  if (focus) return `Next up in ${focus.categoryName}: ${focus.currentStepTitle}`;
  if (recommendationCount > 0) return `${recommendationCount} matched pick${recommendationCount === 1 ? "" : "s"} waiting below.`;
  return "Keep the pace — it's working.";
}

/** Storage key for the dismissible banner. Versioned so a future copy change
 *  can re-surface the banner for everyone instead of staying hidden forever. */
export const MOTIVATION_DISMISS_KEY = "studylamp:dashboard-motivation-dismissed:v1";
