import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";
import { fetchYouTubeDurations } from "@/lib/video-platforms/youtubeDuration";

async function requireAuthenticatedSession(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

// Runs server-side only so the YouTube Data API key is never exposed to the
// browser. Used two ways: (1) backfilling duration right after a single
// "paste a URL" add, since oEmbed doesn't return duration; (2) the
// "Fix missing durations" bulk backfill for videos saved before this
// endpoint existed. Accepts up to 50 ids per request (the Data API's limit).
export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedSession(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idsParam = req.nextUrl.searchParams.get("ids") || "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 50);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  try {
    const { durations, error } = await fetchYouTubeDurations(ids);
    return NextResponse.json({ durations, error });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch durations" }, { status: 500 });
  }
}
