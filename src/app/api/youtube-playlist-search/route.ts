import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { searchYouTubePlaylists } from "@/lib/video-platforms/youtubeSearch";

// Server-only so YOUTUBE_API_KEY is never exposed to the browser, same
// reasoning as /api/youtube-playlist and /api/external-playlist: kept
// behind authentication (rather than fully public) so anonymous traffic
// can't burn through the server's YouTube Data API quota. Used by the
// roadmap page's "Suggested playlists" section (Phase E3).
export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q || !q.trim()) {
    return NextResponse.json({ error: "A search query is required." }, { status: 400 });
  }

  const maxResultsParam = Number(req.nextUrl.searchParams.get("maxResults"));
  const maxResults = Number.isFinite(maxResultsParam) && maxResultsParam > 0 ? maxResultsParam : 5;

  const { playlists, error } = await searchYouTubePlaylists(q, maxResults);
  if (error && playlists.length === 0) {
    return NextResponse.json({ error }, { status: 502 });
  }

  return NextResponse.json({ playlists }, { headers: { "Cache-Control": "private, no-store" } });
}
