import { addDays, format } from "date-fns";
import type { RoadmapStep } from "@/types";

export function sanitizeRoadmapSteps(input: Array<Partial<RoadmapStep> | null | undefined>): RoadmapStep[] {
  const cleaned = (input ?? [])
    .filter((step): step is Partial<RoadmapStep> => !!step)
    .map((step) => {
      const hasWeek = Number.isFinite(step.week as number);
      const base = {
        title: String(step.title ?? "").trim(),
        description: String(step.description ?? "").trim(),
        order: Number.isFinite(step.order) ? Number(step.order) : 0,
      };
      // Only attach `week` when it's a real number. Writing `week:
      // undefined` compiles fine with the client SDK (it silently drops
      // undefined fields) but the Admin SDK throws — "Cannot use
      // 'undefined' as a Firestore value" — since adoptRoadmapTemplateAdmin
      // and the generate route both write with the Admin SDK.
      return hasWeek ? { ...base, week: Number(step.week) } : base;
    })
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
 * position, without re-sorting it. Used by the roadmap editor after a
 * manual add/remove/drag-reorder, where the array order the user just
 * produced IS the intended order.
 */
export function renumberSteps(steps: RoadmapStep[]): RoadmapStep[] {
  return steps.map((step, index) => {
    const base = {
      title: step.title,
      description: step.description || "",
      order: index,
    };
    // Same rule as sanitizeRoadmapSteps: never emit `week: undefined`.
    return Number.isFinite(step.week as number) ? { ...base, week: Number(step.week) } : base;
  });
}

/** Builds a short, specific YouTube search query for a roadmap step so
 *  suggested playlists are grounded in both the step's own topic and its
 *  parent category — "React hooks" alone is too broad, "React hooks
 *  Frontend Development" is specific enough to be useful. */
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

/** Best-effort parse of a roadmap a user pastes in — from another AI tool,
 *  or written by hand. Accepts a JSON array of {title, description, week?}
 *  or a plain numbered/markdown list, one step per line. */
export function parseImportedRoadmapText(text: string): RoadmapStep[] {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return renumberSteps(
        parsed
          .map((item: any, index: number) => ({
            title: String(item?.title ?? "").trim(),
            description: String(item?.description ?? "").trim(),
            order: index,
            week: Number.isFinite(item?.week) ? Number(item.week) : undefined,
          }))
          .filter((s) => !!s.title)
      );
    }
  } catch {
    // not JSON — fall through to line parsing
  }

  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  const steps: RoadmapStep[] = [];
  for (const line of lines) {
    const weekMatch = line.match(/week\s*(\d+)/i);
    const stripped = line.replace(/^\s*(\d+[.)]|[-*]|week\s*\d+[:.]?)\s*/i, "").trim();
    const [titlePart, ...rest] = stripped.split(/\s[—-]\s|:\s/);
    const title = (titlePart || stripped).trim();
    if (!title) continue;
    steps.push({ title, description: rest.join(" - ").trim(), order: steps.length, week: weekMatch ? Number(weekMatch[1]) : undefined });
  }
  return renumberSteps(steps);
}