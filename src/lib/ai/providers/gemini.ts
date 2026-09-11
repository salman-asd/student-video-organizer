import { AiServiceError } from "../errors";
import type { AiConnectionCredentials } from "../types";

/**
 * Gemini adapter. This is the ONLY file in the codebase that should know:
 *   - Gemini's request/response JSON shape
 *   - Gemini's auth mechanism (API key as a query param)
 *   - Gemini's model-path URL format
 *   - how to turn a Gemini error/HTTP status into an AiServiceError
 *
 * Nothing outside src/lib/ai/ should import this file directly — always go
 * through src/lib/ai/aiService.ts's generateVideoSummary(). That keeps a
 * future OpenAI/Anthropic adapter (Phase 8/9) a drop-in, and keeps video
 * components from ever depending on a Gemini SDK/response shape.
 */

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GENERATE_TIMEOUT_MS = 30_000;
const VALIDATE_TIMEOUT_MS = 10_000;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort extraction of Gemini's own error message, so translated
 *  errors are informative without ever including the API key (the key is
 *  only ever in the request URL, never in a response body we might log). */
function extractGeminiMessage(body: any): string | undefined {
  return body?.error?.message;
}

function translateHttpError(status: number, body: any): AiServiceError {
  const detail = extractGeminiMessage(body);

  if (status === 401 || status === 403) {
    return new AiServiceError("auth", "Gemini rejected this API key.");
  }
  if (status === 429) {
    return new AiServiceError("rate_limit", "Gemini rate-limited this request.");
  }
  if (status === 400) {
    // Gemini uses 400 both for "malformed request" and "unknown model" —
    // both are invalid_request, not something a fallback key would fix.
    return new AiServiceError(
      "invalid_request",
      detail ? `Gemini rejected the request: ${detail}` : "Gemini rejected the request."
    );
  }
  if (status === 404) {
    return new AiServiceError("invalid_request", "Gemini model not found for this connection.");
  }
  if (status >= 500) {
    return new AiServiceError("server_error", `Gemini returned a server error (status ${status}).`);
  }
  return new AiServiceError("unknown", `Gemini returned an unexpected error (status ${status}).`);
}

/** Parses a generateContent response into plain text, or throws a
 *  classified AiServiceError for the shapes that aren't "here's your text"
 *  (blocked prompt, empty candidates, unexpected shape). */
function parseGenerateContentResponse(body: any): string {
  const blockReason = body?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new AiServiceError("blocked", `Gemini declined to answer (reason: ${blockReason}).`);
  }

  const candidate = body?.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason === "SAFETY" || finishReason === "RECITATION") {
    throw new AiServiceError("blocked", `Gemini declined to answer (reason: ${finishReason}).`);
  }

  const parts = candidate?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("")
    : undefined;

  if (!text || !text.trim()) {
    throw new AiServiceError("unknown", "Gemini returned an empty response.");
  }
  return text.trim();
}

/**
 * Sends `prompt` to Gemini using `credentials` and returns the plain-text
 * answer. Callers should go through aiService.generateVideoSummary rather
 * than calling this directly.
 */
export async function generateWithGemini(
  credentials: AiConnectionCredentials,
  prompt: string
): Promise<string> {
  const url = `${BASE_URL}/${encodeURIComponent(credentials.model)}:generateContent?key=${encodeURIComponent(
    credentials.apiKey
  )}`;

  let res: Response;
  try {
    res = await withTimeout(GENERATE_TIMEOUT_MS, (signal) =>
      fetch(url, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
        }),
      })
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiServiceError("timeout", "Timed out waiting for Gemini.");
    }
    throw new AiServiceError("network", "Could not reach Gemini.");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw translateHttpError(res.status, body);
  }
  return parseGenerateContentResponse(body);
}

/**
 * Lightweight key check used by the "Test Connection" flow (Phase 2's
 * POST /api/ai/connections/:id/test). Uses a read-only models.list call so
 * testing a connection doesn't spend generation quota. This replaces the
 * route's previous self-contained checkGeminiKey — Gemini-specific
 * validation logic now lives in exactly one place.
 */
export async function validateGeminiConnection(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await withTimeout(VALIDATE_TIMEOUT_MS, (signal) =>
      fetch(`${BASE_URL}?key=${encodeURIComponent(apiKey)}`, { signal })
    );

    if (res.ok) return { ok: true, message: "Connection verified." };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return { ok: false, message: "Gemini rejected this API key." };
    }
    return { ok: false, message: `Gemini returned an unexpected error (status ${res.status}).` };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, message: "Timed out reaching Gemini." };
    }
    return { ok: false, message: "Could not reach Gemini." };
  }
}
