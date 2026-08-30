import { differenceInCalendarDays, format, parseISO } from "date-fns";

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
