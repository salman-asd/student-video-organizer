import { NextRequest, NextResponse } from "next/server";
import { requireAdminUid } from "@/lib/server/requireAuth";
import { getSystemAiDefaults, setSystemAiDefaults, validateSystemDefaultsInput } from "@/lib/server/aiQuota";

export async function GET(req: NextRequest) {
  const adminUid = await requireAdminUid(req);
  if (!adminUid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const defaults = await getSystemAiDefaults();
    return NextResponse.json({ defaults }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to load system AI defaults", err);
    return NextResponse.json({ error: "Failed to load defaults." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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

  const validationError = validateSystemDefaultsInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const defaults = await setSystemAiDefaults(body as any);
    return NextResponse.json({ defaults }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to update system AI defaults", err);
    return NextResponse.json({ error: "Failed to update defaults." }, { status: 500 });
  }
}
