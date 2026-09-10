import { AiServiceError } from "../errors";
import type { AiConnectionCredentials } from "../types";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODELS_URL = "https://openrouter.ai/api/v1/models";
const GENERATE_TIMEOUT_MS = 45_000;
const VALIDATE_TIMEOUT_MS = 10_000;

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await run(controller.signal); } finally { clearTimeout(timer); }
}

function translateHttpError(status: number, body: any): AiServiceError {
  const detail = typeof body?.error?.message === "string" ? body.error.message : undefined;
  if (status === 401 || status === 403) return new AiServiceError("auth", "OpenRouter rejected this API key.");
  if (status === 429) return new AiServiceError("rate_limit", "OpenRouter rate-limited this request.");
  if (status === 400 || status === 404) {
    return new AiServiceError("invalid_request", detail ? `OpenRouter rejected the request: ${detail}` : "OpenRouter rejected the request.");
  }
  if (status >= 500) return new AiServiceError("server_error", `OpenRouter returned a server error (status ${status}).`);
  return new AiServiceError("unknown", `OpenRouter returned an unexpected error (status ${status}).`);
}

function parseCompletion(body: any): string {
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "content_filter") throw new AiServiceError("blocked", "OpenRouter declined to answer this request.");
  const text = choice?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiServiceError("unknown", "OpenRouter returned an empty response.");
  return text.trim();
}

function headers(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "Study Lamp",
  };
}

export async function generateWithOpenRouter(credentials: AiConnectionCredentials, prompt: string): Promise<string> {
  let res: Response;
  try {
    res = await withTimeout(GENERATE_TIMEOUT_MS, (signal) => fetch(CHAT_COMPLETIONS_URL, {
      method: "POST", signal, headers: headers(credentials.apiKey),
      body: JSON.stringify({ model: credentials.model, messages: [{ role: "user", content: prompt }], temperature: 0.7, max_tokens: 900 }),
    }));
  } catch (err: any) {
    if (err?.name === "AbortError") throw new AiServiceError("timeout", "Timed out waiting for OpenRouter.");
    throw new AiServiceError("network", "Could not reach OpenRouter.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw translateHttpError(res.status, body);
  return parseCompletion(body);
}

export async function validateOpenRouterConnection(apiKey: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await withTimeout(VALIDATE_TIMEOUT_MS, (signal) => fetch(MODELS_URL, { signal, headers: headers(apiKey) }));
    if (res.ok) return { ok: true, message: "Connection verified." };
    if (res.status === 401 || res.status === 403) return { ok: false, message: "OpenRouter rejected this API key." };
    return { ok: false, message: `OpenRouter returned an unexpected error (status ${res.status}).` };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, message: "Timed out reaching OpenRouter." };
    return { ok: false, message: "Could not reach OpenRouter." };
  }
}
