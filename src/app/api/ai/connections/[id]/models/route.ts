import { NextRequest, NextResponse } from "next/server";

import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { getConnectionRaw } from "@/lib/server/aiConnections";
import { decryptApiKey } from "@/lib/server/aiEncryption";
import { fetchModelsForProvider } from "@/lib/server/aiModels";

interface RouteParams {
  params: { id: string };
}

// POST /api/ai/connections/:id/models — refresh an *existing* connection's
// available-models list without making the user re-enter their API key.
// Mirrors the test route's pattern: decrypt the stored key server-side,
// call the provider, and return only the model list. The key never leaves
// this function (not even to the response), matching firestore.rules,
// which blocks encryptedApiKey from ever reaching the client.
//
// If the caller is rotating their key (typing a new one before saving),
// pass it in the body as `apiKey` and it's used instead of the stored one —
// same as save behavior already does for a fresh key.
export async function POST(req: NextRequest, { params }: RouteParams) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await getConnectionRaw(uid, params.id);
  if (!connection) {
    return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const overrideKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";

  let apiKey: string;
  if (overrideKey) {
    apiKey = overrideKey;
  } else {
    try {
      apiKey = decryptApiKey(connection.encryptedApiKey);
    } catch (err) {
      console.error("Failed to decrypt AI connection for model refresh", err);
      return NextResponse.json(
        { error: "Could not read this connection's stored key. Try re-adding it." },
        { status: 500 }
      );
    }
  }

  const result = await fetchModelsForProvider(connection.provider, apiKey);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    { models: result.models },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
