import { NextRequest, NextResponse } from "next/server";
import { requireAdminUid } from "@/lib/server/requireAuth";
import {
  createConnection,
  listConnections,
  validateCreateInput,
} from "@/lib/server/systemAiConnections";

export async function GET(req: NextRequest) {
  const adminUid = await requireAdminUid(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const connections = await listConnections();
    return NextResponse.json({ connections }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to list system AI connections", err);
    return NextResponse.json({ error: "Failed to load connections." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const adminUid = await requireAdminUid(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    const connection = await createConnection(body as any);
    return NextResponse.json({ connection }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err: any) {
    console.error("Failed to create system AI connection", err);
    return NextResponse.json({ error: "Failed to save connection." }, { status: 500 });
  }
}
