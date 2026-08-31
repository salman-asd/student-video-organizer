import { differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Goal } from "@/types";

export type DueStatus = "none" | "overdue" | "today" | "soon" | "upcoming";

export interface DueInfo {
  status: DueStatus;
  label: string;
}

/**
 * Turns a goal's plain "YYYY-MM-DD" targetDate into a human label and a
 * status used to color it (red once overdue, amber within a few days).
 * Completed goals never read as "overdue" — the deadline no longer matters
 * once the goal is done.
 */
export function describeDueDate(
  targetDate: string | null | undefined,
  completed: boolean,
  now: Date = new Date()
): DueInfo {
  if (!targetDate) return { status: "none", label: "" };
  const due = parseISO(targetDate);
  if (Number.isNaN(due.getTime())) return { status: "none", label: "" };

  if (completed) return { status: "none", label: `Was due ${format(due, "MMM d")}` };

  const days = differenceInCalendarDays(due, now);
  if (days < 0) {
    const overdueBy = Math.abs(days);
    return { status: "overdue", label: `Overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"}` };
  }
  if (days === 0) return { status: "today", label: "Due today" };
  if (days <= 3) return { status: "soon", label: `Due in ${days} day${days === 1 ? "" : "s"}` };
  return { status: "upcoming", label: `Due ${format(due, "MMM d")}` };
}

export function isGoalOverdue(
  goal: { targetDate?: string | null; completed: boolean },
  now: Date = new Date()
): boolean {
  if (goal.completed || !goal.targetDate) return false;
  return describeDueDate(goal.targetDate, false, now).status === "overdue";
}

export interface LinkedPlaylistRef {
  id: string;
  title: string;
}

export interface LinkedVideoRef {
  id: string;
  playlistId: string;
  playlistTitle: string;
  title: string;
}

/**
 * A goal can now link multiple playlists (linkedPlaylists), but goals
 * created before that existed only ever had a single linkedPlaylistId/
 * linkedPlaylistTitle pair. Reading through this instead of the raw field
 * means every other piece of code — progress calculation, the goal card,
 * the edit dialog — only has to understand one shape.
 */
export function getGoalLinkedPlaylists(
  goal: Pick<Goal, "linkedPlaylists" | "linkedPlaylistId" | "linkedPlaylistTitle">
): LinkedPlaylistRef[] {
  if (goal.linkedPlaylists && goal.linkedPlaylists.length > 0) return goal.linkedPlaylists;
  if (goal.linkedPlaylistId) return [{ id: goal.linkedPlaylistId, title: goal.linkedPlaylistTitle || "Untitled playlist" }];
  return [];
}

export function getGoalLinkedVideos(goal: Pick<Goal, "linkedVideos">): LinkedVideoRef[] {
  return goal.linkedVideos || [];
}

/**
 * Aggregate watched/total progress across every playlist and individual
 * video linked to a goal. `allVideos` should be every personal video the
 * user owns (across all playlists) — each video appears in it exactly
 * once, so filtering it by "belongs to a linked playlist OR was linked
 * individually" naturally avoids double-counting a video that's both
 * (no separate de-dup step needed, since a single video object can only
 * ever match the filter once regardless of how many of its criteria are true).
 */
export function calculateGoalProgress(
  goal: Pick<Goal, "linkedPlaylists" | "linkedPlaylistId" | "linkedPlaylistTitle" | "linkedVideos">,
  allVideos: { id: string; playlistId: string; status: string }[]
): { watched: number; total: number } {
  const playlistIds = new Set(getGoalLinkedPlaylists(goal).map((p) => p.id));
  const videoIds = new Set(getGoalLinkedVideos(goal).map((v) => v.id));
  if (playlistIds.size === 0 && videoIds.size === 0) return { watched: 0, total: 0 };

  const matched = allVideos.filter((v) => playlistIds.has(v.playlistId) || videoIds.has(v.id));
  return { watched: matched.filter((v) => v.status === "completed").length, total: matched.length };
}
