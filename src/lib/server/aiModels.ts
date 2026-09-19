import type { AiProvider } from "@/types";

const MODEL_ENDPOINTS: Record<AiProvider, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/models",
  openai: "https://api.openai.com/v1/models",
  anthropic: "https://api.anthropic.com/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
};

export interface AiModelOption {
  id: string;
  name: string;
}

type FetchModelsResult = { models: AiModelOption[] } | { error: string; status: number };

/**
 * Calls a provider's models-list endpoint with the given API key and
 * returns a normalized, sorted model list. Shared by
 * /api/ai/connections/models (new connection, key typed by the user) and
 * /api/ai/connections/:id/models (existing connection, key decrypted
 * server-side) so both routes stay in sync on supported providers.
 */
export async function fetchModelsForProvider(
  provider: AiProvider,
  apiKey: string
): Promise<FetchModelsResult> {
  const endpoint = MODEL_ENDPOINTS[provider];
  if (!endpoint) {
    return { error: `Unsupported provider: ${provider}`, status: 400 };
  }

  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    return { error: "API key is required.", status: 400 };
  }

  // Gemini's Generative Language API does not accept an API key as an
  // Authorization: Bearer header — it requires it as a `key` query
  // parameter. Sending it as a Bearer token gets rejected with a generic
  // "Expected OAuth 2 access token..." error, which is what was happening
  // here before this fix.
  const url =
    provider === "gemini"
      ? `${endpoint}?key=${encodeURIComponent(trimmedApiKey)}`
      : endpoint;

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "anthropic") {
    // Anthropic uses x-api-key instead of Authorization: Bearer.
    headers["x-api-key"] = trimmedApiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (provider !== "gemini") {
    // OpenAI-compatible providers (openai, openrouter, groq) use a Bearer token.
    headers.Authorization = `Bearer ${trimmedApiKey}`;
  }

  const response = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.error?.message || data?.error || `Unable to fetch models (${response.status})`;
    return { error: errorMessage, status: response.status };
  }

  // Gemini's response shape is { models: [{ name: "models/gemini-1.5-pro",
  // displayName: "Gemini 1.5 Pro", ... }] } — completely different from the
  // OpenAI-compatible { data: [{ id, ... }] } shape every other provider
  // here uses, so it needs its own parsing branch rather than falling
  // through to the generic one below (which would silently return an
  // empty list for Gemini even once the auth fix above is in place).
  if (provider === "gemini") {
    const models: AiModelOption[] = Array.isArray(data?.models)
      ? data.models
          .map((m: any) => {
            const id = typeof m?.name === "string" ? m.name.replace(/^models\//, "") : "";
            return { id, name: m?.displayName || id };
          })
          .filter((m: AiModelOption) => m.id.trim().length > 0)
          .sort((a: AiModelOption, b: AiModelOption) => a.name.localeCompare(b.name))
      : [];
    return { models };
  }

  const models: AiModelOption[] = Array.isArray(data?.data)
    ? data.data
        .map((m: any) => ({ id: m?.id || m?.name || "", name: m?.name || m?.id || "" }))
        .filter((m: AiModelOption) => m.id.trim().length > 0)
        .sort((a: AiModelOption, b: AiModelOption) => a.name.localeCompare(b.name))
    : [];

  return { models };
}
