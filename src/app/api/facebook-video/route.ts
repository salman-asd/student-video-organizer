import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";
import { resolveFacebookRedirectUrl, fetchFacebookVideoOEmbed } from "@/lib/video-platforms/facebookGraph";
import { detectVideoProvider, generateCanonicalUrl, generateFacebookOEmbedUrl } from "@/lib/video-platforms";

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

// Runs server-side so short-link redirect resolution has a stable place to
// live, same as YOUTUBE_API_KEY-backed lookups staying server-side in
// /api/youtube-duration. Two jobs: (1) resolve a short share link
// (fb.watch, /share/v/) to its canonical, ID-bearing URL via a plain
// redirect follow (no Graph API needed for this part); (2) fetch
// title/thumbnail/author via the Graph API's tokenless oEmbed Video
// endpoint (no app credentials needed as of Meta's 15 June 2026 change —
// see facebookGraph.ts).
// Returns `{ metadata: null }` (not an error) whenever the video can't be
// resolved — a private video or Facebook simply declining to serve full
// oEmbed for that URL — so the client falls back to the same manual-entry
// UX already used elsewhere for unfetchable metadata, rather than
// surfacing a scary error for an expected case.
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
    // Keep the URL actually carrying the ID (rawUrl, or the redirect
    // target for short links) separate from canonicalUrl below.
    // canonicalUrl() is Reel-aware (see FacebookVideoProvider.canonicalUrl
    // in providers.ts): a Reel normalizes to `/reel/{id}/`, anything else
    // to `/watch/?v={id}`. That single shape is what's used consistently
    // for oEmbed, storage, and (later, client-side) the player embed —
    // do NOT reintroduce a second place that forces `/watch/?v=` for
    // Reels, that mismatch is exactly what caused newly-saved Reels to
    // oEmbed fine but render a black player.
    let sourceUrl = rawUrl;
    let canonicalUrl = generateCanonicalUrl(rawUrl);
    console.log(`[facebook-video] input url="${rawUrl}" canonicalUrl="${canonicalUrl ?? "(unresolved)"}"`);

    // A short share link normalizes with no canonical URL yet (see
    // FacebookVideoProvider.normalize) — resolve the redirect server-side,
    // then re-run detection against the resolved URL.
    if (!canonicalUrl) {
      const resolved = await resolveFacebookRedirectUrl(rawUrl);
      console.log(`[facebook-video] resolved short link "${rawUrl}" -> "${resolved ?? "(failed)"}"`);
      if (resolved) {
        const resolvedProvider = detectVideoProvider(resolved);
        if (resolvedProvider?.platform === "facebook") {
          sourceUrl = resolved;
          canonicalUrl = generateCanonicalUrl(resolved);
          console.log(`[facebook-video] canonicalUrl after redirect="${canonicalUrl ?? "(unresolved)"}"`);
        }
      }
    }

    if (!canonicalUrl) {
      console.warn(`[facebook-video] could not resolve a canonical URL for "${rawUrl}" — falling back to manual entry`);
      return NextResponse.json({ metadata: null, canonicalUrl: null });
    }

    const oEmbedUrl = generateFacebookOEmbedUrl(sourceUrl) || canonicalUrl;
    // canonicalUrl is also what gets scraped for Open Graph tags. That
    // fetch isn't shape-sensitive the way the oEmbed call is (a Reel's
    // /reel/ page and a video's /watch/ page both carry normal og:* meta
    // tags), so reusing the same Reel-aware canonicalUrl here is fine and
    // — since it's now the actual public URL for the video rather than an
    // always-/watch/ rewrite — is if anything more likely to match what
    // Facebook serves for that specific post.
    const metadata = await fetchFacebookVideoOEmbed(oEmbedUrl, canonicalUrl);
    console.log(
      `[facebook-video] metadata for "${canonicalUrl}":`,
      metadata
        ? {
            title: metadata.title,
            authorName: metadata.authorName,
            thumbnailUrl: metadata.thumbnailUrl,
            hasHtml: Boolean(metadata.html),
          }
        : null
    );
    if (metadata && !metadata.thumbnailUrl) {
      console.warn(`[facebook-video] no usable thumbnail for "${canonicalUrl}" — Graph API has no unauthenticated fallback for a single arbitrary video (see facebookGraph.ts); client falls back to manual thumbnail entry.`);
    }
    return NextResponse.json({ metadata, canonicalUrl });
  } catch (err: any) {
    // Metadata is best-effort for Facebook (see facebookGraph.ts) — a
    // thrown error here still degrades to manual entry rather than
    // blocking the add-video flow.
    console.error(`[facebook-video] unexpected error resolving "${rawUrl}":`, err);
    return NextResponse.json({ metadata: null, canonicalUrl: null, error: err?.message || "Failed to fetch Facebook video metadata" });
  }
}