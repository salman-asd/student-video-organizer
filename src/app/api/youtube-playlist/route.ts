import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/server/firebase-admin";
import { fetchExternalPlaylistPreview } from "@/lib/video-platforms/playlist";

async function requireAdminSession(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    const snap = await adminDb.collection("users").doc(decoded.uid).get();
    const role = snap.exists ? snap.data()?.role : null;
    return role === "admin" ? decoded.uid : null;
  } catch {
    return null;
  }
}

// Runs server-side only so the YouTube Data API key is never exposed to the
// browser. This route is restricted to authenticated administrators, because
// public metadata fetches still consume server quota and should never be opened
// to arbitrary unauthenticated users.
export async function GET(req: NextRequest) {
  const adminUid = await requireAdminSession(req);
  if (!adminUid) {
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
        order: video.order,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch playlist" }, { status: 500 });
  }
}
