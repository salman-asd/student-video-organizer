import { NextRequest, NextResponse } from "next/server";
import { requireAdminUid } from "@/lib/server/requireAuth";
import {
  deleteConnection,
  updateConnection,
  validateUpdateInput,
} from "@/lib/server/systemAiConnections";

interface RouteParams {
  params: { id: string };
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

  const validationError = validateUpdateInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const connection = await updateConnection(params.id, body as any);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    return NextResponse.json({ connection }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to update system AI connection", err);
    return NextResponse.json({ error: "Failed to update connection." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const adminUid = await requireAdminUid(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const deleted = await deleteConnection(params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to delete system AI connection", err);
    return NextResponse.json({ error: "Failed to delete connection." }, { status: 500 });
  }
}
