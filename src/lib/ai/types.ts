import type { AiProvider } from "@/types";

/**
 * Everything an adapter needs to make one request, with the API key already
 * decrypted. Building/loading this from Firestore (Phase 1/2's
 * users/{uid}/aiConnections/{id}) and calling aiEncryption's decryptApiKey
 * is the caller's job — same split as the existing
 * src/app/api/ai/connections/[id]/test/route.ts, which decrypts the key
 * itself and only ever hands the plaintext to a short-lived local variable.
 * Keeping that responsibility outside this module means the AI service has
 * no Firestore/encryption dependency of its own and stays easy to test.
 */
export interface AiConnectionCredentials {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

/** Transcript-backed input for the first AI feature. Title remains optional
 *  for compatibility, but the prompt is intentionally grounded only in the
 *  transcript text. */
export interface VideoSummaryInput {
  title?: string;
  description?: string | null;
  transcript: string;
}
