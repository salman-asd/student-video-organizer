import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { fetchFreshFacebookThumbnail, resolveFacebookRedirectUrl } from "@/lib/video-platforms/facebookGraph";
import { detectVideoProvider, generateCanonicalUrl } from "@/lib/video-platforms";

/**
 * POST /api/facebook-video/thumbnail
 * Body: { urls: string[] }   (Facebook video / Reel / short-share URLs, max 10)
 * Returns: { results: Record<originalUrl, freshThumbnailUrl | null> }
 *
 * Self-healing for expired Facebook thumbnails. The stored thumbnail URLs are
 * signed and expire, so the Library/Playlist pages call this with the videos
 * whose saved thumbnail is missing or expired, then write the fresh URL back.
 *
 * Safety: this route makes server-side requests, so every input is required
 * to be a recognised Facebook video URL BEFORE anything is fetched (no open
 * proxy / SSRF), and a resolved short-link target must also be Facebook.
 * A null result is a normal outcome, not an error — the client keeps the old URL.
 */
const MAX_URLS = 10;
const CONCURRENCY = 3;

async function resolveOne(rawUrl: string): Promise<string | null> {
  if (typeof rawUrl !== "string" || rawUrl.length > 2000) return null;
  if (detectVideoProvider(rawUrl)?.platform !== "facebook") return null;

  let pageUrl = generateCanonicalUrl(rawUrl);
  if (!pageUrl) {
    // Short share link (fb.watch, /share/v/): follow the redirect, then re-check the host.
    const resolved = await resolveFacebookRedirectUrl(rawUrl);
    if (!resolved || detectVideoProvider(resolved)?.platform !== "facebook") return null;
    pageUrl = generateCanonicalUrl(resolved);
  }
  if (!pageUrl) return null;
  return fetchFreshFacebookThumbnail(pageUrl);
}

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const urls = (body as { urls?: unknown })?.urls;
  if (!Array.isArray(urls) || urls.length === 0 || urls.some((u) => typeof u !== "string")) {
    return NextResponse.json({ error: "urls must be a non-empty array of strings." }, { status: 400 });
  }
  if (urls.length > MAX_URLS) {
    return NextResponse.json({ error: `At most ${MAX_URLS} urls per request.` }, { status: 400 });
  }

  const unique = Array.from(new Set(urls as string[]));
  const results: Record<string, string | null> = {};

  // Small worker pool: polite to Facebook and keeps the function well inside its time limit.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, async () => {
      while (cursor < unique.length) {
        const url = unique[cursor++];
        try {
          results[url] = await resolveOne(url);
        } catch {
          results[url] = null;
        }
      }
    })
  );

  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
