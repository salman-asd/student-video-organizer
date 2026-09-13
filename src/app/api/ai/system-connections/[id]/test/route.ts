import { NextRequest, NextResponse } from "next/server";
import { requireAdminUid } from "@/lib/server/requireAuth";
import { decryptApiKey } from "@/lib/server/aiEncryption";
import { getConnectionRaw, recordTestResult } from "@/lib/server/systemAiConnections";
import { validateGeminiConnection } from "@/lib/ai/providers/gemini";
import { validateOpenAiConnection } from "@/lib/ai/providers/openai";
import { validateAnthropicConnection } from "@/lib/ai/providers/anthropic";
import { validateOpenRouterConnection } from "@/lib/ai/providers/openrouter";
import { validateGroqConnection } from "@/lib/ai/providers/groq";

interface RouteParams { params: { id: string }; }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const adminUid = await requireAdminUid(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const connection = await getConnectionRaw(params.id);
  if (!connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  let apiKey: string;
  try {
    apiKey = decryptApiKey(connection.encryptedApiKey);
  } catch (err) {
    console.error("Failed to decrypt system AI connection for test", err);
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

  if (result.ok || result.message.endsWith("rejected this API key.")) {
    await recordTestResult(params.id, { success: result.ok });
  }

  return NextResponse.json(
    { success: result.ok, message: result.message },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
