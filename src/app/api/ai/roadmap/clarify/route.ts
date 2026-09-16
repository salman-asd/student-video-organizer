import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { AiServiceError, generateTopicClarification } from "@/lib/ai/aiService";

const STATUS_BY_CODE: Record<string, number> = {
  auth: 400, rate_limit: 429, invalid_request: 502, blocked: 422,
  timeout: 504, network: 502, server_error: 502, unsupported_provider: 400, unknown: 500,
};

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }

  const rawName = String(body?.name ?? "").trim();
  if (!rawName) return NextResponse.json({ error: "A topic name is required." }, { status: 400 });

  try {
    const result = await withAiConnection(uid, (apiKey, provider, model) => generateTopicClarification({ provider, apiKey, model }, rawName));
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    // Clarification is best-effort — never block adding an interest over it.
    if (err instanceof AiServiceError) console.error(`Clarify AI error [${err.code}]: ${err.message}`);
    return NextResponse.json({ ambiguous: false });
  }
}