import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";
import { fetchExternalPlaylistPreview } from "@/lib/video-platforms/playlist";

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
// browser. Any signed-in user may call this — both the admin shared-library
// importer and the personal "My Playlists" importer use it — but it stays
// behind authentication (rather than fully public) so anonymous traffic
// can't burn through the server's YouTube Data API quota.
export async function GET(req: NextRequest) {
  const uid = await requireAuthenticatedSession(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playlistId = req.nextUrl.searchParams.get("playlistId");
  const rawUrl = req.nextUrl.searchParams.get("url");

  const sourceUrl = rawUrl || (playlistId ? `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}` : "");

  if (!sourceUrl.trim()) {
    return NextResponse.json({ error: "Missing playlist URL or playlistId" }, { status: 400 });
  }

  try {
    const preview = await fetchExternalPlaylistPreview(sourceUrl);
    return NextResponse.json({
      title: preview.title,
      description: preview.description || "",
      thumbnailUrl: preview.thumbnailUrl || "",
      sourceUrl: preview.sourceUrl,
      totalVideos: preview.totalVideos,
      unavailableCount: preview.unavailableCount,
      videos: preview.videos.map((video) => ({
        title: video.title,
        youtubeVideoId: video.youtubeVideoId || null,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl || "",
        durationSeconds: typeof video.durationSeconds === "number" ? video.durationSeconds : null,
        order: video.order,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch playlist" }, { status: 500 });
  }
}
