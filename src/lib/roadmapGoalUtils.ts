import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { OnboardingRoadmapOffer, RoadmapLevel, RoadmapStep } from "@/types";

const ROADMAP_LEVELS: RoadmapLevel[] = ["basic", "intermediate", "advanced"];

/**
 * Parses the `generate` query param onboarding hands off to /roadmap.
 *
 * The value round-trips through a URL, so it's untrusted input: anything
 * malformed, truncated by a link shortener, or hand-edited just means "no
 * offer" rather than a crash on page load. Returning null is always a valid
 * outcome here — the roadmap page works fine without an offer.
 */
export function parseOnboardingRoadmapOffer(raw: string | null | undefined): OnboardingRoadmapOffer | null {
  if (!raw) return null;

  // Decode defensively: useSearchParams().get() already hands us a decoded
  // value, but buildOnboardingRoadmapOffer (and any URL copied out of the
  // address bar) produces an encoded one. decodeURIComponent throws on a bare
  // "%", so a malformed param falls back to the raw string rather than
  // taking down the page.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // keep raw
  }

  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") return null;

    const categoryId = String((parsed as any).categoryId ?? "").trim();
    const categoryName = String((parsed as any).categoryName ?? "").trim();
    const level = (parsed as any).level;

    if (!categoryId || !categoryName) return null;
    if (!ROADMAP_LEVELS.includes(level)) return null;

    return { categoryId, categoryName, level };
  } catch {
    return null;
  }
}

/**
 * Auto-generates `offer` query params for a single onboarding hand-off.
 * Kept next to the parser so the two can't drift apart.
 */
export function buildOnboardingRoadmapOffer(offer: OnboardingRoadmapOffer): string {
  return encodeURIComponent(JSON.stringify(offer));
}

/**
 * Default target date for a goal created from a roadmap step (Phase C2).
 *
 * Anchored on the step's own `week` when the roadmap has one, so "Week 4"
 * lands four weeks out rather than on an arbitrary date; steps without a
 * week fall back to a modest two-week horizon. Both are clamped the same way
 * goalDraftTargetDate clamps AI-suggested dates, so a malformed `week` can't
 * produce a date in the past or decades in the future.
 */
export function defaultGoalTargetDateForStep(step: Pick<RoadmapStep, "week">, now: Date = new Date()): string {
  const weeks = Number.isFinite(step.week as number) && (step.week as number) > 0 ? (step.week as number) : 2;
  const days = Math.min(365, Math.max(1, Math.round(weeks * 7)));
  return format(addDays(now, days), "yyyy-MM-dd");
}

/**
 * Spreads goal target dates across a roadmap's remaining steps.
 *
 * Used when a user sets goals from several steps at once: giving every goal
 * the same "week N" date would stack them on one day and make the pace
 * numbers meaningless. Steps without a `week` are spaced by `fallbackSpacingDays`
 * from the previous goal's date instead.
 */
export function spreadGoalTargetDates(
  steps: Array<Pick<RoadmapStep, "week">>,
  now: Date = new Date(),
  fallbackSpacingDays = 7
): string[] {
  return steps.map((step, index) => {
    if (Number.isFinite(step.week as number) && (step.week as number) > 0) {
      return defaultGoalTargetDateForStep(step, now);
    }
    return format(addDays(now, Math.min(365, Math.max(1, (index + 1) * fallbackSpacingDays))), "yyyy-MM-dd");
  });
}

/**
 * Index of the step a user is currently "on" for a roadmap, given how much of
 * the linked content they've finished.
 *
 * Deliberately simple and predictable: progress is measured in completed
 * videos, and the step index is capped so the last step stays reachable
 * instead of running off the end of the list once everything is watched.
 * Returns 0 for an empty step list so callers never have to guard.
 */
export function currentRoadmapStepIndex(steps: RoadmapStep[], completedVideos: number): number {
  if (!steps || steps.length === 0) return 0;
  const safeCompleted = Number.isFinite(completedVideos) ? Math.max(0, Math.floor(completedVideos)) : 0;
  return Math.min(safeCompleted, steps.length - 1);
}

/** True when a target date ("YYYY-MM-DD") is in the past. */
export function isTargetDatePast(targetDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!targetDate) return false;
  const due = parseISO(targetDate);
  if (Number.isNaN(due.getTime())) return false;
  return differenceInCalendarDays(due, now) < 0;
}
