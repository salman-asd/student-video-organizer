import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { getConnectionRaw, recordTestResult } from "@/lib/server/aiConnections";
import { decryptApiKey } from "@/lib/server/aiEncryption";
import { validateGeminiConnection } from "@/lib/ai/providers/gemini";
import { validateOpenAiConnection } from "@/lib/ai/providers/openai";
import { validateAnthropicConnection } from "@/lib/ai/providers/anthropic";
import { validateOpenRouterConnection } from "@/lib/ai/providers/openrouter";
import { validateGroqConnection } from "@/lib/ai/providers/groq";

interface RouteParams {
  params: { id: string };
}

// Provider-specific validation lives in each adapter so this route doesn't
// duplicate provider request/auth handling. Keep this dispatch aligned with
// the provider switch in aiService.generateVideoSummary.

// POST /api/ai/connections/:id/test — decrypts the stored key server-side,
// makes a lightweight validation call, records the result, and returns only
// a pass/fail summary. The key itself never leaves this function.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getConnectionRaw(uid, params.id);
  if (!connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(connection.encryptedApiKey);
  } catch (err) {
    // Decryption failure (e.g. the encryption key rotated without
    // re-encrypting stored connections) is a server misconfiguration, not
    // something the user's key can fix — don't mark the connection invalid.
    console.error("Failed to decrypt AI connection for test", err);
    return NextResponse.json(
      { error: "Could not read this connection's stored key. Try re-adding it." },
      { status: 500 }
    );
  }

  const result = connection.provider === "gemini"
    ? await validateGeminiConnection(apiKey)
    : connection.provider === "openai"
      ? await validateOpenAiConnection(apiKey)
      : connection.provider === "anthropic"
        ? await validateAnthropicConnection(apiKey)
        : connection.provider === "openrouter"
          ? await validateOpenRouterConnection(apiKey)
          : await validateGroqConnection(apiKey);

  // Only a genuine "the key itself is bad" response updates status —
  // network/timeout hiccups shouldn't flip a previously-working connection
  // to "invalid" (see Phase 7's fuller error classification later).
  if (result.ok || result.message.endsWith("rejected this API key.")) {
    await recordTestResult(uid, params.id, { success: result.ok });
  }

  return NextResponse.json(
    { success: result.ok, message: result.message },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
