import type { AiConnectionSummary, AiProvider } from "@/types";

// Thin client-side wrappers around the Phase 2 API routes. Deliberately not
// a "service layer" abstraction — just fetch + the Bearer-token header
// pattern already used inline elsewhere in this app, pulled into one place
// because two components (the settings page and its add/edit dialog) both
// need all five calls.

export interface CreateAiConnectionInput {
  provider: AiProvider;
  apiKey: string;
  model: string;
  label: string;
}

export interface UpdateAiConnectionInput {
  apiKey?: string;
  model?: string;
  label?: string;
  priority?: number;
  isActive?: boolean;
}

export interface AiModel { id: string; name: string; }

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function authHeaders(idToken: string, withJson = false): HeadersInit {
  return {
    Authorization: `Bearer ${idToken}`,
    ...(withJson ? { "Content-Type": "application/json" } : {}),
  };
}

export async function listAiConnections(idToken: string): Promise<AiConnectionSummary[]> {
  const res = await fetch("/api/ai/connections", { headers: authHeaders(idToken) });
  const data = await parseOrThrow(res);
  return data.connections as AiConnectionSummary[];
}

export async function createAiConnection(
  idToken: string,
  input: CreateAiConnectionInput
): Promise<AiConnectionSummary> {
  const res = await fetch("/api/ai/connections", {
    method: "POST",
    headers: authHeaders(idToken, true),
    body: JSON.stringify(input),
  });
  const data = await parseOrThrow(res);
  return data.connection as AiConnectionSummary;
}

export async function updateAiConnection(
  idToken: string,
  id: string,
  input: UpdateAiConnectionInput
): Promise<AiConnectionSummary> {
  const res = await fetch(`/api/ai/connections/${id}`, {
    method: "PATCH",
    headers: authHeaders(idToken, true),
    body: JSON.stringify(input),
  });
  const data = await parseOrThrow(res);
  return data.connection as AiConnectionSummary;
}

export async function deleteAiConnection(idToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/ai/connections/${id}`, {
    method: "DELETE",
    headers: authHeaders(idToken),
  });
  await parseOrThrow(res);
}

export async function testAiConnection(
  idToken: string,
  id: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/ai/connections/${id}/test`, {
    method: "POST",
    headers: authHeaders(idToken),
  });
  const data = await parseOrThrow(res);
  return { success: !!data.success, message: data.message || "" };
}

// Phase 6: persists a new drag-and-drop order. There's no bulk-reorder
// route — aiConnections is a small per-user list (a handful of
// connections), so N individual PATCH calls is simpler than adding a batch
// endpoint for it. Every item gets its priority rewritten to its array
// index, not just the ones that moved, so a partial failure can't leave two
// connections sharing a priority.
export async function reorderAiConnections(idToken: string, orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => updateAiConnection(idToken, id, { priority: index })));
}

/** 
 * Fetch available models using the provider API key. 
 * The API key is sent only to our server endpoint. 
 * It is NOT sent directly from the browser to OpenRouter/Gemini/etc.
 */
export async function fetchAiModels(
  idToken: string, 
  provider: AiProvider, 
  apiKey: string
): Promise<AiModel[]> {
  const res = await fetch("/api/ai/connections/models", { 
    method: "POST", 
    headers: authHeaders(idToken, true), 
    body: JSON.stringify({ provider, apiKey, }), 
  }); 
  const data = await parseOrThrow(res); 
  return (data.models || []) as AiModel[];
}

/**
 * Refresh the model list for an *existing, saved* connection without
 * making the user re-enter their API key: the server decrypts the stored
 * key and calls the provider directly. If `apiKey` is passed (the user is
 * rotating their key before saving), it's used instead of the stored one —
 * same override behavior `updateAiConnection` already uses on save.
 */
export async function fetchAiModelsForConnection(
  idToken: string,
  id: string,
  apiKey?: string
): Promise<AiModel[]> {
  const res = await fetch(`/api/ai/connections/${id}/models`, {
    method: "POST",
    headers: authHeaders(idToken, true),
    body: JSON.stringify(apiKey?.trim() ? { apiKey: apiKey.trim() } : {}),
  });
  const data = await parseOrThrow(res);
  return (data.models || []) as AiModel[];
}
