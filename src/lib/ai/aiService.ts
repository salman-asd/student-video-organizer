import { AiServiceError } from "./errors";
import { buildStarterSummaryPrompt } from "./prompts";
import { generateWithGemini } from "./providers/gemini";
import { generateWithOpenAi } from "./providers/openai";
import { generateWithAnthropic } from "./providers/anthropic";
import { generateWithOpenRouter } from "./providers/openrouter";
import { generateWithGroq } from "./providers/groq";
import type { AiConnectionCredentials, VideoSummaryInput } from "./types";

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

export { AiServiceError } from "./errors";
export type { AiErrorCode } from "./errors";
export type { AiConnectionCredentials, VideoSummaryInput } from "./types";
