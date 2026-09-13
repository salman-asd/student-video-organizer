import { AiServiceError } from "./errors";
import { buildGoalSuggestionPrompt, buildQuizPrompt, buildStarterSummaryPrompt } from "./prompts";
import { generateWithGemini } from "./providers/gemini";
import { generateWithOpenAi } from "./providers/openai";
import { generateWithAnthropic } from "./providers/anthropic";
import { generateWithOpenRouter } from "./providers/openrouter";
import { generateWithGroq } from "./providers/groq";
import type {
  AiConnectionCredentials,
  GoalSuggestion,
  GoalSuggestionInput,
  QuizQuestion,
  QuizVideoInput,
  VideoSummaryInput,
} from "./types";
import type { RoadmapStep } from "@/types";
import { sanitizeRoadmapSteps } from "@/lib/roadmapUtils";

/**
 * Application-facing AI API. This is the ONLY module that video/summary
 * code (Phase 5) should import from src/lib/ai — never a provider adapter
 * directly, and never a Gemini SDK.
 *
 * Current architecture (see study-lamp-ai-roadmap.md, Phase 8):
 *
 *   AI Service -> provider adapter -> Gemini/OpenAI API
 *
 * That change should be internal to this file. The exported signature —
 * generateVideoSummary(connection, video) — is intended to stay stable
 * across that change; only what happens inside it should grow (e.g. trying
 * further connections on a transient AiServiceError instead of returning
 * after the first attempt).
 */
export async function generateVideoSummary(
  connection: AiConnectionCredentials,
  video: VideoSummaryInput
): Promise<string> {
  const prompt = buildStarterSummaryPrompt(video);

  switch (connection.provider) {
    case "gemini":
      return generateWithGemini(connection, prompt);
    case "openai":
      return generateWithOpenAi(connection, prompt);
    case "anthropic":
      return generateWithAnthropic(connection, prompt);
    case "openrouter":
      return generateWithOpenRouter(connection, prompt);
    case "groq":
      return generateWithGroq(connection, prompt);
    default:
      // Exhaustiveness check: if AiProvider ever grows a new member without
      // a matching case above, this line fails to compile.
      // eslint-disable-next-line no-case-declarations
      const _exhaustive: never = connection.provider;
      throw new AiServiceError(
        "unsupported_provider",
        `Provider "${_exhaustive}" is not supported yet.`
      );
  }
}

export interface RoadmapPlan {
  basic: RoadmapStep[];
  intermediate: RoadmapStep[];
  advanced: RoadmapStep[];
}

function roadmapPrompt(categoryName: string): string {
  return `You are a curriculum designer for a personalized learning app. Generate a learning roadmap for the category "${categoryName}".
Return JSON only with this exact structure:
{
  "basic": [{ "title": "string", "description": "string", "order": 1 }, ...],
  "intermediate": [{ "title": "string", "description": "string", "order": 1 }, ...],
  "advanced": [{ "title": "string", "description": "string", "order": 1 }, ...]
}
Requirements:
- Each level must contain 3 to 6 steps.
- Keep the language clear and actionable.
- Use realistic learning milestones for the category.
- Keep descriptions concise but useful.
- JSON must valid and parseable.`;
}

function extractJsonPayloadText(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return "";

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1).trim();
  }

  return text;
}

export function parseRoadmapPlanFromText(raw: string): RoadmapPlan {
  const text = (raw ?? "").trim();
  if (!text) throw new AiServiceError("invalid_request", "Invalid roadmap response.");

  const payloadText = extractJsonPayloadText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new AiServiceError("invalid_request", "Invalid roadmap response.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new AiServiceError("invalid_request", "Invalid roadmap response.");
  }

  const record = parsed as Record<string, unknown>;
  const basic = sanitizeRoadmapSteps(Array.isArray(record.basic) ? (record.basic as Array<Partial<RoadmapStep> | null | undefined>) : []);
  const intermediate = sanitizeRoadmapSteps(Array.isArray(record.intermediate) ? (record.intermediate as Array<Partial<RoadmapStep> | null | undefined>) : []);
  const advanced = sanitizeRoadmapSteps(Array.isArray(record.advanced) ? (record.advanced as Array<Partial<RoadmapStep> | null | undefined>) : []);

  if (basic.length === 0 || intermediate.length === 0 || advanced.length === 0) {
    throw new AiServiceError("invalid_request", "Invalid roadmap response.");
  }

  return { basic, intermediate, advanced };
}

export async function generateRoadmapPlan(
  connection: AiConnectionCredentials,
  categoryName: string
): Promise<RoadmapPlan> {
  const prompt = roadmapPrompt(categoryName);

  let raw: string;
  switch (connection.provider) {
    case "gemini":
      raw = await generateWithGemini(connection, prompt);
      break;
    case "openai":
      raw = await generateWithOpenAi(connection, prompt);
      break;
    case "anthropic":
      raw = await generateWithAnthropic(connection, prompt);
      break;
    case "openrouter":
      raw = await generateWithOpenRouter(connection, prompt);
      break;
    case "groq":
      raw = await generateWithGroq(connection, prompt);
      break;
    default:
      const _exhaustive: never = connection.provider;
      throw new AiServiceError(
        "unsupported_provider",
        `Provider "${_exhaustive}" is not supported yet.`
      );
  }

  return parseRoadmapPlanFromText(raw);
}

export function parseQuizQuestionsFromText(raw: string): QuizQuestion[] {
  const text = (raw ?? "").trim();
  if (!text) throw new AiServiceError("invalid_request", "Invalid quiz response.");

  const payloadText = extractJsonPayloadText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new AiServiceError("invalid_request", "Invalid quiz response.");
  }

  if (!Array.isArray(parsed)) {
    throw new AiServiceError("invalid_request", "Invalid quiz response.");
  }

  const questions: QuizQuestion[] = parsed.map((item, index) => {
    const q = item as Record<string, unknown>;
    const options = Array.isArray(q.options) ? q.options.map((option) => option as Record<string, unknown>) : [];

    const normalized = {
      id: typeof q.id === "string" ? q.id : `q${index + 1}`,
      prompt: typeof q.prompt === "string" ? q.prompt.trim() : "",
      options: options.map((option, optIndex) => ({
        id: typeof option.id === "string" ? option.id : `o${optIndex + 1}`,
        text: typeof option.text === "string" ? option.text.trim() : "",
      })),
      correctOptionId: typeof q.correctOptionId === "string" ? q.correctOptionId : "",
      explanation: typeof q.explanation === "string" ? q.explanation.trim() : "",
    };

    if (!normalized.prompt || normalized.options.length < 2 || !normalized.correctOptionId || !normalized.explanation) {
      throw new AiServiceError("invalid_request", "Invalid quiz response.");
    }

    return normalized;
  });

  return questions;
}

export async function generateVideoQuiz(
  connection: AiConnectionCredentials,
  video: QuizVideoInput
): Promise<QuizQuestion[]> {
  const prompt = buildQuizPrompt(video);

  let raw: string;
  switch (connection.provider) {
    case "gemini":
      raw = await generateWithGemini(connection, prompt);
      break;
    case "openai":
      raw = await generateWithOpenAi(connection, prompt);
      break;
    case "anthropic":
      raw = await generateWithAnthropic(connection, prompt);
      break;
    case "openrouter":
      raw = await generateWithOpenRouter(connection, prompt);
      break;
    case "groq":
      raw = await generateWithGroq(connection, prompt);
      break;
    default:
      const _exhaustive: never = connection.provider;
      throw new AiServiceError(
        "unsupported_provider",
        `Provider "${_exhaustive}" is not supported yet.`
      );
  }

  return parseQuizQuestionsFromText(raw);
}

/** Parses and validates the model's raw text into GoalSuggestion[],
 *  mirroring parseQuizQuestionsFromText's tolerant-but-strict shape: accept
 *  a fenced ```json block or bare JSON, but throw AiServiceError("invalid_request")
 *  rather than silently returning malformed/empty drafts. */
export function parseGoalSuggestionsFromText(raw: string): GoalSuggestion[] {
  const text = (raw ?? "").trim();
  if (!text) throw new AiServiceError("invalid_request", "Invalid goal suggestion response.");

  const payloadText = extractJsonPayloadText(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    throw new AiServiceError("invalid_request", "Invalid goal suggestion response.");
  }

  if (!Array.isArray(parsed)) {
    throw new AiServiceError("invalid_request", "Invalid goal suggestion response.");
  }

  const suggestions: GoalSuggestion[] = parsed.slice(0, 4).map((item) => {
    const g = item as Record<string, unknown>;
    const title = typeof g.title === "string" ? g.title.trim() : "";
    const notes = typeof g.notes === "string" ? g.notes.trim() : "";
    const daysFromNow = Number.isFinite(g.daysFromNow) ? Number(g.daysFromNow) : NaN;

    if (!title || !Number.isFinite(daysFromNow)) {
      throw new AiServiceError("invalid_request", "Invalid goal suggestion response.");
    }

    return { title, notes, daysFromNow };
  });

  if (suggestions.length === 0) {
    throw new AiServiceError("invalid_request", "Invalid goal suggestion response.");
  }

  return suggestions;
}

/** Turns a roadmap's steps into 2-4 candidate Goal drafts (Phase E4). Never
 *  writes a Goal itself — the caller (POST /api/ai/goals/suggest and the
 *  roadmap page) is responsible for turning an accepted draft into a real
 *  Goal via the existing goal-creation code. */
export async function generateGoalSuggestions(
  connection: AiConnectionCredentials,
  input: GoalSuggestionInput
): Promise<GoalSuggestion[]> {
  const prompt = buildGoalSuggestionPrompt(input);

  let raw: string;
  switch (connection.provider) {
    case "gemini":
      raw = await generateWithGemini(connection, prompt);
      break;
    case "openai":
      raw = await generateWithOpenAi(connection, prompt);
      break;
    case "anthropic":
      raw = await generateWithAnthropic(connection, prompt);
      break;
    case "openrouter":
      raw = await generateWithOpenRouter(connection, prompt);
      break;
    case "groq":
      raw = await generateWithGroq(connection, prompt);
      break;
    default:
      const _exhaustive: never = connection.provider;
      throw new AiServiceError(
        "unsupported_provider",
        `Provider "${_exhaustive}" is not supported yet.`
      );
  }

  return parseGoalSuggestionsFromText(raw);
}

export { AiServiceError } from "./errors";
export type { AiErrorCode } from "./errors";
export type {
  AiConnectionCredentials,
  GoalSuggestion,
  GoalSuggestionInput,
  QuizQuestion,
  QuizVideoInput,
  VideoSummaryInput,
} from "./types";
