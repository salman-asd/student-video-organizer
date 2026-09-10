import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { deleteConnection, updateConnection, validateUpdateInput } from "@/lib/server/aiConnections";

interface RouteParams {
  params: { id: string };
}

// PATCH /api/ai/connections/:id — partial update. Body may include any of:
// { apiKey, model, label, priority, isActive }.
//
// Ownership is enforced by construction, not by a separate check: uid comes
// from the verified token, never from the request, and every Firestore path
// in aiConnections.ts is built as users/{uid}/aiConnections/{id} — there is
// no code path where a caller's uid can reach another user's document.
export async function PATCH(req: NextRequest, { params }: RouteParams) {
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

  const validationError = validateUpdateInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const connection = await updateConnection(uid, params.id, body as any);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    return NextResponse.json({ connection }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to update AI connection", err);
    return NextResponse.json({ error: "Failed to update connection." }, { status: 500 });
  }
}

// DELETE /api/ai/connections/:id
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const deleted = await deleteConnection(uid, params.id);
    if (!deleted) {
      return NextResponse.json({ error: "Connection not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to delete AI connection", err);
    return NextResponse.json({ error: "Failed to delete connection." }, { status: 500 });
  }
}
