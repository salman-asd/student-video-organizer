import { addDays, format } from "date-fns";
import type { RoadmapStep } from "@/types";

export function sanitizeRoadmapSteps(input: Array<Partial<RoadmapStep> | null | undefined>): RoadmapStep[] {
  const cleaned = (input ?? [])
    .filter((step): step is Partial<RoadmapStep> => !!step)
    .map((step) => ({
      title: String(step.title ?? "").trim(),
      description: String(step.description ?? "").trim(),
      order: Number.isFinite(step.order) ? Number(step.order) : 0,
    }))
    .filter((step) => !!step.title && step.title.length > 0)
    .sort((a, b) => {
      const orderDelta = (a.order ?? 0) - (b.order ?? 0);
      if (orderDelta !== 0) return orderDelta;
      return a.title.localeCompare(b.title);
    })
    .map((step, index) => ({
      ...step,
      order: typeof step.order === "number" && Number.isFinite(step.order) ? step.order : index,
      description: step.description || "",
    }));

  return cleaned;
}

/**
 * Re-numbers a step list's `order` field to match its current array
 * position, without re-sorting it. Used by the roadmap editor (Phase E2)
 * after a manual add/remove/drag-reorder, where the array order the user
 * just produced IS the intended order — re-sorting by title/order like
 * sanitizeRoadmapSteps does would undo the very edit the user just made.
 */
export function renumberSteps(steps: RoadmapStep[]): RoadmapStep[] {
  return steps.map((step, index) => ({
    title: step.title,
    description: step.description || "",
    order: index,
  }));
}

/** Builds a short, specific YouTube search query for a roadmap step so
 *  suggested playlists (Phase E3) are grounded in both the step's own
 *  topic and its parent category — "React hooks" alone is too broad,
 *  "React hooks Frontend Development" is specific enough to be useful. */
export function buildPlaylistSearchQuery(stepTitle: string, categoryName: string): string {
  const step = (stepTitle || "").trim();
  const category = (categoryName || "").trim();
  if (step && category) return `${step} ${category} playlist`;
  return (step || category || "").trim();
}

export interface GoalDraft {
  title: string;
  notes: string;
  daysFromNow: number;
}

/** Turns an AI-suggested goal draft's relative offset into an absolute
 *  "YYYY-MM-DD" target date the Goals page already knows how to render
 *  (see goalUtils.describeDueDate). Clamped to a sane 1-365 day window so a
 *  malformed AI response can't produce a target date in the past or
 *  decades away. */
export function goalDraftTargetDate(daysFromNow: number, now: Date = new Date()): string {
  const clamped = Math.min(365, Math.max(1, Math.round(Number.isFinite(daysFromNow) ? daysFromNow : 14)));
  return format(addDays(now, clamped), "yyyy-MM-dd");
}
