import type { Goal, LearningRoadmap, UserInterest } from "@/types";
import { selectActiveRoadmap, resolveCurrentStep } from "@/lib/recommendations";
import { computeDailyPace, calculateGoalProgress } from "@/lib/goalUtils";

/**
 * Display-name and summary helpers for the Dashboard (Phase D).
 *
 * These exist because the pre-Phase-D dashboard rendered `interest.categoryId`
 * directly as a title. A category id is a Firestore document id — a random
 * 20-character string — so users saw ids where topic names belonged, in both
 * the "Roadmap Recommendations" and "AI Learning Coach" cards. Resolving ids
 * to names is the whole point of this module; keeping it pure and separate
 * makes it testable and gives every card one place to agree on the answer.
 */

export interface CategoryLike {
  id: string;
  name: string;
}

/**
 * Builds an id → display name map, merging the user's categories with any
 * extra names we already know about (e.g. names carried on their interests).
 * First writer wins so a real category name always beats a fallback.
 */
export function buildCategoryNameMap(categories: CategoryLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const category of categories ?? []) {
    const name = (category?.name ?? "").trim();
    if (category?.id && name) map.set(category.id, name);
  }
  return map;
}

/**
 * Resolves a category id to a human name.
 *
 * Falls back to a visibly-flagged placeholder rather than the raw id: showing
 * "Unknown topic" tells the user something is wrong, whereas showing
 * "kR3nT8xQ2p" just looks like the app is broken. `fallback` lets a caller
 * supply a better guess (a roadmap's own category name, a goal title).
 */
export function resolveCategoryName(
  categoryId: string | null | undefined,
  names: Map<string, string>,
  fallback = "Unknown topic"
): string {
  if (!categoryId) return fallback;
  return names.get(categoryId) ?? fallback;
}

export interface RoadmapFocusRow {
  id: string;
  categoryId: string;
  /** The user-facing topic name — never a raw category id. */
  categoryName: string;
  level: string;
  roadmapId: string | null;
  stepCount: number;
  completedVideos: number;
  currentStepIndex: number;
  currentStepTitle: string;
  /** Step index / step count, as a percentage. */
  progressPercent: number;
}

/**
 * One row per active focus area (interest that has a roadmap with steps),
 * carrying both the topic name and the real current step.
 *
 * Both fields were wrong on the old dashboard: the title was a category id,
 * and "next step" was guessed by indexing into the steps array with a count
 * computed from a *different* total than the progress bar used — so the label
 * and the bar could disagree. Both now come from resolveCurrentStep, which is
 * the same function Phase C3's recommendations use, so the roadmap page, the
 * recommendations, and this card all agree on "where am I".
 */
export function buildRoadmapFocusRows(
  interests: UserInterest[],
  roadmaps: LearningRoadmap[],
  videos: Array<{ id: string; categoryId?: string | null; status?: string | null }>,
  names: Map<string, string>
): RoadmapFocusRow[] {
  const rows: RoadmapFocusRow[] = [];

  for (const interest of interests ?? []) {
    const forCategory = (roadmaps ?? []).filter((r) => r.categoryId === interest.categoryId);
    const roadmap =
      forCategory.find((r) => r.level === interest.level && (r.steps?.length ?? 0) > 0) ??
      forCategory.find((r) => (r.steps?.length ?? 0) > 0);
    if (!roadmap) continue;

    const { step, index, completedVideos } = resolveCurrentStep(roadmap, videos as any);
    const stepCount = roadmap.steps.length;

    rows.push({
      id: `${roadmap.categoryId}-${roadmap.level}`,
      categoryId: roadmap.categoryId,
      categoryName: resolveCategoryName(roadmap.categoryId, names),
      level: roadmap.level,
      roadmapId: roadmap.id,
      stepCount,
      completedVideos,
      currentStepIndex: index,
      currentStepTitle: step?.title || `Step ${index + 1}`,
      progressPercent: stepCount > 0 ? Math.round(((index + 1) / stepCount) * 100) : 0,
    });
  }

  return rows;
}

export interface GoalPaceRow {
  id: string;
  title: string;
  watched: number;
  total: number;
  progressPercent: number;
  status: string;
  videosRemaining: number;
  videosPerDayNeeded: number;
  daysRemaining: number;
  targetDate: string | null;
}

export function buildGoalPaceRows(
  goals: Goal[],
  videos: Array<{ id: string; playlistId?: string | null; status?: string | null }>,
  now: Date = new Date()
): GoalPaceRow[] {
  return (goals ?? [])
    .filter((goal) => !goal.completed)
    .map((goal) => {
      const pace = computeDailyPace(goal, videos, now);
      const progress = calculateGoalProgress(goal, videos);
      return {
        id: goal.id,
        title: goal.title,
        watched: progress.watched,
        total: progress.total,
        progressPercent: progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0,
        status: pace.status,
        videosRemaining: pace.videosRemaining,
        videosPerDayNeeded: pace.videosPerDayNeeded,
        daysRemaining: pace.daysRemaining,
        targetDate: goal.targetDate ?? null,
      };
    })
    .sort((a, b) => {
      const rank = (status: string) => (status === "overdue" ? 0 : status === "behind" ? 1 : 2);
      return rank(a.status) - rank(b.status) || b.total - a.total;
    });
}

/** The single focus area the "current step" summary should describe. */
export function pickPrimaryFocus(rows: RoadmapFocusRow[]): RoadmapFocusRow | null {
  if (rows.length === 0) return null;
  // Most complete first — that's the one closest to a payoff.
  return [...rows].sort((a, b) => b.progressPercent - a.progressPercent)[0];
}

/** True when the user has nothing set up yet, so the dashboard should show a
 *  single clear "get started" prompt instead of a wall of empty charts. */
export interface BrandNewUserInput {
  interests: UserInterest[];
  roadmaps: LearningRoadmap[];
  goals: Goal[];
  videoCount: number;
}

export function isBrandNewUser(input: BrandNewUserInput): boolean;
export function isBrandNewUser(
  interests: UserInterest[],
  roadmaps: LearningRoadmap[],
  goals: Goal[],
  videoCount: number
): boolean;
export function isBrandNewUser(
  first: BrandNewUserInput | UserInterest[],
  roadmaps?: LearningRoadmap[],
  goals?: Goal[],
  videoCount?: number
): boolean {
  const interests = Array.isArray(first) ? first : first.interests;
  const roadmapList = Array.isArray(first) ? (roadmaps ?? []) : first.roadmaps;
  const goalList = Array.isArray(first) ? (goals ?? []) : first.goals;
  const count = Array.isArray(first) ? (videoCount ?? 0) : first.videoCount;

  const hasRoadmapContent = (roadmapList ?? []).some((r) => (r.steps?.length ?? 0) > 0);
  return (interests?.length ?? 0) === 0 && !hasRoadmapContent && (goalList?.length ?? 0) === 0 && count === 0;
}

export { selectActiveRoadmap };
// ── Weekly activity (Phase D chart data) ─────────────────

export interface DayBucket {
  /** Short weekday label, e.g. "Mon". */
  label: string;
  /** ISO yyyy-mm-dd, for stable keys and lookups. */
  dateKey: string;
  count: number;
}

/**
 * Buckets completed videos into the last `days` calendar days, oldest first.
 *
 * Uses calendar days (local) rather than "last 168 hours" so the chart's bars
 * line up with what a user means by "Monday" — a rolling window would put
 * yesterday's evening session in a bucket labelled with today's date
 * depending on the time of day.
 */
export function buildWeeklyActivity(
  videos: Array<{ state?: { status?: string | null; completedAt?: unknown } | null }>,
  now: Date = new Date(),
  days = 7
): DayBucket[] {
  const buckets: DayBucket[] = [];
  const indexByDate = new Map<string, number>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    date.setHours(0, 0, 0, 0);
    const dateKey = toDateKey(date);
    indexByDate.set(dateKey, buckets.length);
    buckets.push({
      label: date.toLocaleDateString(undefined, { weekday: "short" }),
      dateKey,
      count: 0,
    });
  }

  const earliest = new Date(now);
  earliest.setDate(earliest.getDate() - (days - 1));
  earliest.setHours(0, 0, 0, 0);

  for (const video of videos ?? []) {
    if (video?.state?.status !== "completed") continue;
    const millis = timestampMillis(video.state.completedAt);
    if (!millis || millis < earliest.getTime()) continue;

    const completedOn = new Date(millis);
    completedOn.setHours(0, 0, 0, 0);
    const index = indexByDate.get(toDateKey(completedOn));
    if (index !== undefined) buckets[index].count += 1;
  }

  return buckets;
}

/** How many videos were completed in the last `days` calendar days. */
export function countCompletedSince(
  videos: Array<{ state?: { status?: string | null; completedAt?: unknown } | null }>,
  since: Date
): number {
  const from = since.getTime();
  return (videos ?? []).filter((video) => {
    if (video?.state?.status !== "completed") return false;
    const millis = timestampMillis(video.state.completedAt);
    return millis > 0 && millis >= from;
  }).length;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
