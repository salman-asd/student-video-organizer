import { NextRequest, NextResponse } from "next/server";

// Runs server-side only so the YouTube Data API key is never exposed to the
// browser. Uses the free quota tier (no billing account required for normal
// usage) — no videos are downloaded, only public metadata is read.
export async function GET(req: NextRequest) {
  const playlistId = req.nextUrl.searchParams.get("playlistId");
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!playlistId) {
    return NextResponse.json({ error: "Missing playlistId" }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY is not configured on the server. Add it to your environment variables." },
      { status: 500 }
    );
  }

  try {
    const items: any[] = [];
    let pageToken = "";
    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("maxResults", "50");
      url.searchParams.set("playlistId", playlistId);
      url.searchParams.set("key", apiKey);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data?.error?.message || "YouTube API error" }, { status: res.status });
      }
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    const videos = items
      .filter((it) => it.snippet?.title && it.snippet.title !== "Deleted video" && it.snippet.title !== "Private video")
      .map((it, index) => ({
        title: it.snippet.title as string,
        youtubeVideoId: it.contentDetails?.videoId as string,
        videoUrl: `https://www.youtube.com/watch?v=${it.contentDetails?.videoId}`,
        thumbnailUrl:
          it.snippet.thumbnails?.high?.url ||
          it.snippet.thumbnails?.medium?.url ||
          it.snippet.thumbnails?.default?.url ||
          "",
        order: index,
      }));

    return NextResponse.json({ videos, playlistTitle: items[0]?.snippet?.channelTitle || null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch playlist" }, { status: 500 });
  }
}
