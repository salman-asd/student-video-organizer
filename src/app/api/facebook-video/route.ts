import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";
import { resolveFacebookRedirectUrl, fetchFacebookVideoOEmbed } from "@/lib/video-platforms/facebookGraph";
import { detectVideoProvider, generateCanonicalUrl } from "@/lib/video-platforms";

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

// Runs server-side only so the Facebook app secret (used to build the app
// access token) never reaches the browser — same reasoning as
// YOUTUBE_API_KEY staying server-side in /api/youtube-duration. Two jobs:
// (1) resolve a short share link (fb.watch, /share/v/) to its canonical,
// ID-bearing URL via a plain redirect follow (no Graph API needed for
// this part); (2) fetch title/thumbnail/author via the Graph API's
// oEmbed Video endpoint, which Facebook does require an app token for.
// Returns `{ metadata: null }` (not an error) whenever the video can't be
// resolved — a private video, missing server config, or Facebook simply
// declining to serve oEmbed for that URL — so the client falls back to
// the same manual-entry UX already used elsewhere for unfetchable
// metadata, rather than surfacing a scary error for an expected case.
export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedSession(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  try {
    let canonicalUrl = generateCanonicalUrl(rawUrl);

    // A short share link normalizes with no canonical URL yet (see
    // FacebookVideoProvider.normalize) — resolve the redirect server-side,
    // then re-run detection against the resolved URL.
    if (!canonicalUrl) {
      const resolved = await resolveFacebookRedirectUrl(rawUrl);
      if (resolved) {
        const resolvedProvider = detectVideoProvider(resolved);
        if (resolvedProvider?.platform === "facebook") {
          canonicalUrl = generateCanonicalUrl(resolved);
        }
      }
    }

    if (!canonicalUrl) {
      return NextResponse.json({ metadata: null, canonicalUrl: null });
    }

    const metadata = await fetchFacebookVideoOEmbed(canonicalUrl);
    return NextResponse.json({ metadata, canonicalUrl });
  } catch (err: any) {
    // Metadata is best-effort for Facebook (see facebookGraph.ts) — a
    // thrown error here still degrades to manual entry rather than
    // blocking the add-video flow.
    return NextResponse.json({ metadata: null, canonicalUrl: null, error: err?.message || "Failed to fetch Facebook video metadata" });
  }
}
