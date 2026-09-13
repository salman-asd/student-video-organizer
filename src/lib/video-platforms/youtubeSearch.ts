/**
 * YouTube Data API v3 search.list (type=playlist), used to suggest
 * playlists per roadmap step (study-lamp-learning-platform-roadmap.md,
 * Phase E3). Same env var and quota-conscious, server-only style as
 * youtubeDuration.ts — this app's existing YouTube Data API usage only
 * covered `videos.list` (duration lookups) before this, so search.list is
 * new API surface on the same key.
 */

export interface YouTubePlaylistSearchResult {
  playlistId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  playlistUrl: string;
}

export interface YouTubePlaylistSearchResponse {
  playlists: YouTubePlaylistSearchResult[];
  error: string | null;
}

/** Searches YouTube for playlists matching `query`. maxResults is clamped
 *  to [1, 10] — search.list's own ceiling per call, and far more than a
 *  "Suggested playlists" section under a single roadmap step should ever
 *  show. Returns an empty list with an `error` string rather than throwing,
 *  so a UI section can degrade to "no suggestions right now" instead of a
 *  hard failure. */
export async function searchYouTubePlaylists(
  query: string,
  maxResults = 5
): Promise<YouTubePlaylistSearchResponse> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { playlists: [], error: "YOUTUBE_API_KEY is not set on the server." };

  const trimmedQuery = (query || "").trim();
  if (!trimmedQuery) return { playlists: [], error: null };

  const clampedMax = Math.min(10, Math.max(1, Math.round(maxResults) || 5));

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "playlist");
  url.searchParams.set("q", trimmedQuery);
  url.searchParams.set("maxResults", String(clampedMax));
  url.searchParams.set("safeSearch", "strict");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      return { playlists: [], error: data?.error?.message || `YouTube API request failed (${res.status})` };
    }

    const playlists: YouTubePlaylistSearchResult[] = (data.items || [])
      .map((item: any) => {
        const playlistId = item?.id?.playlistId;
        if (!playlistId) return null;
        return {
          playlistId,
          title: item?.snippet?.title || "Untitled playlist",
          channelTitle: item?.snippet?.channelTitle || "",
          thumbnailUrl: item?.snippet?.thumbnails?.medium?.url || item?.snippet?.thumbnails?.default?.url || "",
          playlistUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
        };
      })
      .filter((item: YouTubePlaylistSearchResult | null): item is YouTubePlaylistSearchResult => !!item);

    return { playlists, error: null };
  } catch (e: any) {
    return { playlists: [], error: e?.message || "Network error contacting the YouTube Data API" };
  }
}
