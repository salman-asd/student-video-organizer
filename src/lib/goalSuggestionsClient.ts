import type { GoalSuggestion } from "@/lib/ai/types";

export type { GoalSuggestion };

export interface SuggestGoalsInput {
  categoryName: string;
  level: string;
  steps: Array<{ title: string; description?: string }>;
}

/** Asks the AI service to turn a roadmap's steps into 2-4 candidate Goal
 *  drafts (Phase E4). Mirrors quizClient.ts's idToken-bearer fetch pattern. */
export async function suggestGoalsFromRoadmap(
  idToken: string,
  input: SuggestGoalsInput
): Promise<GoalSuggestion[]> {
  const res = await fetch("/api/ai/goals/suggest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Goal suggestion failed (${res.status})`);
  return Array.isArray(data.suggestions) ? data.suggestions : [];
}
