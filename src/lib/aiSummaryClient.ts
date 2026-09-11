// Thin client-side wrapper around POST /api/ai/summary — same fetch +
// Bearer-token pattern as src/lib/aiConnectionsClient.ts. Deliberately just
// one function: unlike AI connections, there's only one thing a video page
// needs to do here.

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export interface GenerateStarterSummaryInput {
  youtubeVideoId: string;
}

export async function generateStarterSummary(
  idToken: string,
  input: GenerateStarterSummaryInput
): Promise<string> {
  const res = await fetch("/api/ai/summary", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const data = await parseOrThrow(res);
  return data.summary as string;
}
