import type { AiProvider } from "@/types";

/**
 * Everything an adapter needs to make one request, with the API key already
 * decrypted. Building/loading this from Firestore (Phase 1/2's
 * users/{uid}/aiConnections/{id}) and calling aiEncryption's decryptApiKey
 * is the caller's job — same split as the existing
 * src/app/api/ai/connections/[id]/test/route.ts, which decrypts the key
 * itself and only ever hands the plaintext to a short-lived local variable.
 * Keeping that responsibility outside this module means the AI service has
 * no Firestore/encryption dependency of its own and stays easy to test.
 */
export interface AiConnectionCredentials {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/** Transcript-backed input for the first AI feature. Title remains optional
 *  for compatibility, but the prompt is intentionally grounded only in the
 *  transcript text. */
export interface VideoSummaryInput {
  title?: string;
  description?: string | null;
  transcript: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
}

export interface QuizVideoInput {
  title?: string;
  description?: string | null;
  transcript: string;
}

/** Input for turning a learning roadmap's steps into a handful of candidate
 *  Goal drafts (Phase E4). Only step titles/descriptions and the category
 *  name are sent — no user PII. */
export interface GoalSuggestionInput {
  categoryName: string;
  level: string;
  steps: Array<{ title: string; description?: string }>;
}

/** One AI-drafted goal, before the user has reviewed or accepted it.
 *  `daysFromNow` is relative (not an absolute date) so the prompt/parser
 *  never has to reason about "today's date" — the caller converts it to an
 *  absolute "YYYY-MM-DD" via roadmapUtils.goalDraftTargetDate. */
export interface GoalSuggestion {
  title: string;
  notes: string;
  daysFromNow: number;
}
