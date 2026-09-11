import { AiServiceError } from "../errors";
import type { AiConnectionCredentials } from "../types";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODELS_URL = "https://api.anthropic.com/v1/models";
const ANTHROPIC_VERSION = "2023-06-01";
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

function extractAnthropicMessage(body: any): string | undefined {
  return typeof body?.error?.message === "string" ? body.error.message : undefined;
}

function translateHttpError(status: number, body: any): AiServiceError {
  const detail = extractAnthropicMessage(body);
  if (status === 401 || status === 403) {
    return new AiServiceError("auth", "Anthropic rejected this API key.");
  }
  if (status === 429) {
    return new AiServiceError("rate_limit", "Anthropic rate-limited this request.");
  }
  if (status === 400 || status === 404) {
    return new AiServiceError(
      "invalid_request",
      detail ? `Anthropic rejected the request: ${detail}` : "Anthropic rejected the request."
    );
  }
  if (status >= 500) {
    return new AiServiceError("server_error", `Anthropic returned a server error (status ${status}).`);
  }
  return new AiServiceError("unknown", `Anthropic returned an unexpected error (status ${status}).`);
}

function parseMessage(body: any): string {
  if (body?.stop_reason === "refusal") {
    throw new AiServiceError("blocked", "Anthropic declined to answer this request.");
  }
  const text = Array.isArray(body?.content)
    ? body.content
        .filter((block: any) => block?.type === "text" && typeof block?.text === "string")
        .map((block: any) => block.text)
        .join("")
    : "";
  if (!text.trim()) {
    throw new AiServiceError("unknown", "Anthropic returned an empty response.");
  }
  return text.trim();
}

function headers(apiKey: string): HeadersInit {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "Content-Type": "application/json",
  };
}

export async function generateWithAnthropic(
  credentials: AiConnectionCredentials,
  prompt: string
): Promise<string> {
  let res: Response;
  try {
    res = await withTimeout(GENERATE_TIMEOUT_MS, (signal) =>
      fetch(MESSAGES_URL, {
        method: "POST",
        signal,
        headers: headers(credentials.apiKey),
        body: JSON.stringify({
          model: credentials.model,
          max_tokens: 600,
          messages: [{ role: "user", content: prompt }],
        }),
      })
    );
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new AiServiceError("timeout", "Timed out waiting for Anthropic.");
    }
    throw new AiServiceError("network", "Could not reach Anthropic.");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw translateHttpError(res.status, body);
  return parseMessage(body);
}

export async function validateAnthropicConnection(
  apiKey: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await withTimeout(VALIDATE_TIMEOUT_MS, (signal) =>
      fetch(MODELS_URL, { signal, headers: headers(apiKey) })
    );
    if (res.ok) return { ok: true, message: "Connection verified." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Anthropic rejected this API key." };
    }
    return { ok: false, message: `Anthropic returned an unexpected error (status ${res.status}).` };
  } catch (err: any) {
    if (err?.name === "AbortError") return { ok: false, message: "Timed out reaching Anthropic." };
    return { ok: false, message: "Could not reach Anthropic." };
  }
}
