import { AiServiceError } from "../errors";
import type { AiConnectionCredentials } from "../types";

const CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const MODELS_URL = "https://api.openai.com/v1/models";
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

function extractOpenAiMessage(body: any): string | undefined {
  return typeof body?.error?.message === "string" ? body.error.message : undefined;
}

function translateHttpError(status: number, body: any): AiServiceError {
  const detail = extractOpenAiMessage(body);
  if (status === 401 || status === 403) {
    return new AiServiceError("auth", "OpenAI rejected this API key.");
  }
  if (status === 429) {
    return new AiServiceError("rate_limit", "OpenAI rate-limited this request.");
  }
  if (status === 400 || status === 404) {
    return new AiServiceError(
      "invalid_request",
      detail ? `OpenAI rejected the request: ${detail}` : "OpenAI rejected the request."
    );
  }
  if (status >= 500) {
    return new AiServiceError("server_error", `OpenAI returned a server error (status ${status}).`);
  }
  return new AiServiceError("unknown", `OpenAI returned an unexpected error (status ${status}).`);
}

function parseChatCompletion(body: any): string {
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "content_filter") {
    throw new AiServiceError("blocked", "OpenAI declined to answer this request.");
  }
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new AiServiceError("unknown", "OpenAI returned an empty response.");
  }
  return text.trim();
}

export async function generateWithOpenAi(
  credentials: AiConnectionCredentials,
  prompt: string
): Promise<string> {
  let res: Response;
  try {
    res = await withTimeout(GENERATE_TIMEOUT_MS, (signal) =>
      fetch(CHAT_COMPLETIONS_URL, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: credentials.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
        }),
      })
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiServiceError("timeout", "Timed out waiting for OpenAI.");
    }
    throw new AiServiceError("network", "Could not reach OpenAI.");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw translateHttpError(res.status, body);
  return parseChatCompletion(body);
}

export async function validateOpenAiConnection(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await withTimeout(VALIDATE_TIMEOUT_MS, (signal) =>
      fetch(MODELS_URL, { signal, headers: { Authorization: `Bearer ${apiKey}` } })
    );
    if (res.ok) return { ok: true, message: "Connection verified." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "OpenAI rejected this API key." };
    }
    return { ok: false, message: `OpenAI returned an unexpected error (status ${res.status}).` };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, message: "Timed out reaching OpenAI." };
    return { ok: false, message: "Could not reach OpenAI." };
  }
}
