import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { createConnection, listConnections, validateCreateInput } from "@/lib/server/aiConnections";

// GET /api/ai/connections — list the caller's own connections, masked.
export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = await listConnections(uid);
    return NextResponse.json({ connections }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to list AI connections", err);
    return NextResponse.json({ error: "Failed to load connections." }, { status: 500 });
  }
}

// POST /api/ai/connections — create a connection. Body: { provider, apiKey, model, label }.
export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validationError = validateCreateInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const connection = await createConnection(uid, body as any);
    return NextResponse.json({ connection }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err: any) {
    // Deliberately generic — never let a raw error object (which could
    // theoretically echo back request data) reach the client.
    console.error("Failed to create AI connection", err);
    return NextResponse.json({ error: "Failed to save connection." }, { status: 500 });
  }
}
