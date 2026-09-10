export interface AiPreferences {
  speechToTextEnabled: boolean;
}

async function request(idToken: string, init?: RequestInit): Promise<AiPreferences> {
  const res = await fetch("/api/ai/preferences", {
    ...init,
    headers: { Authorization: `Bearer ${idToken}`, ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data.preferences as AiPreferences;
}

export function getAiPreferences(idToken: string) {
  return request(idToken);
}

export function updateAiPreferences(idToken: string, preferences: AiPreferences) {
  return request(idToken, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });
}
