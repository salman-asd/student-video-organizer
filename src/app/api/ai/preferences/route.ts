import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { getAiPreferences, updateAiPreferences } from "@/lib/server/aiPreferences";

export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ preferences: await getAiPreferences(uid) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.speechToTextEnabled !== "boolean") {
    return NextResponse.json({ error: "speechToTextEnabled must be a boolean." }, { status: 400 });
  }
  const preferences = await updateAiPreferences(uid, { speechToTextEnabled: body.speechToTextEnabled });
  return NextResponse.json({ preferences }, { headers: { "Cache-Control": "private, no-store" } });
}
