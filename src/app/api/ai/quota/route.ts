import { NextRequest, NextResponse } from "next/server";
import { requireAdminUid, requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { getOrInitQuota, setUserQuotaOverride, validateQuotaOverrideInput } from "@/lib/server/aiQuota";

export async function GET(req: NextRequest) {
  const authUid = await requireAuthenticatedUid(req);
  if (!authUid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targetUid = new URL(req.url).searchParams.get("uid") || authUid;
  const canReadTarget = targetUid === authUid || !!(await requireAdminUid(req));
  if (!canReadTarget) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const quota = await getOrInitQuota(targetUid);
    return NextResponse.json({ quota }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to load quota", err);
    return NextResponse.json({ error: "Failed to load quota." }, { status: 500 });
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

  const validationError = validateQuotaOverrideInput(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const uid = (body as Record<string, unknown>)?.uid;
  if (typeof uid !== "string" || !uid.trim()) {
    return NextResponse.json({ error: "uid is required." }, { status: 400 });
  }

  try {
    const quota = await setUserQuotaOverride(uid, body as any);
    return NextResponse.json({ quota }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    console.error("Failed to update quota", err);
    return NextResponse.json({ error: "Failed to update quota." }, { status: 500 });
  }
}
