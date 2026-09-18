import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { fetchModelsForProvider } from "@/lib/server/aiModels";

import type { AiProvider } from "@/types";

// POST /api/ai/connections/models — used when adding a *new* connection
// (or rotating the key on an existing one before saving), where the caller
// has just typed a key that isn't stored anywhere yet.
//
// For refreshing an *already-saved* connection's models without having the
// key on hand, see /api/ai/connections/[id]/models instead, which decrypts
// the stored key server-side.
export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const provider = body?.provider as AiProvider;
    const apiKey = body?.apiKey as string;

    if (!provider) {
      return NextResponse.json({ error: "Provider is required." }, { status: 400 });
    }
    if (!apiKey?.trim()) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }

    const result = await fetchModelsForProvider(provider, apiKey);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      { models: result.models },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error: any) {
    console.error("Fetch AI models error:", error);
    return NextResponse.json(
      { error: error?.message || "Unable to fetch AI models." },
      { status: 500 }
    );
  }
}
