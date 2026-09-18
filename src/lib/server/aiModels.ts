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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${trimmedApiKey}`,
    "Content-Type": "application/json",
  };

  // Anthropic uses x-api-key instead of Authorization: Bearer.
  if (provider === "anthropic") {
    delete headers.Authorization;
    headers["x-api-key"] = trimmedApiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  const response = await fetch(endpoint, { method: "GET", headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.error?.message || data?.error || `Unable to fetch models (${response.status})`;
    return { error: errorMessage, status: response.status };
  }

  const models: AiModelOption[] = Array.isArray(data?.data)
    ? data.data
        .map((m: any) => ({ id: m?.id || m?.name || "", name: m?.name || m?.id || "" }))
        .filter((m: AiModelOption) => m.id.trim().length > 0)
        .sort((a: AiModelOption, b: AiModelOption) => a.name.localeCompare(b.name))
    : [];

  return { models };
}
