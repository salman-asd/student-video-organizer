import type { YouTubePlaylistSearchResult } from "@/lib/video-platforms/youtubeSearch";

export type { YouTubePlaylistSearchResult };

/** Searches YouTube for playlists relevant to a roadmap step (Phase E3).
 *  Mirrors quizClient.ts's idToken-bearer fetch pattern. */
export async function searchPlaylistsForStep(
  idToken: string,
  query: string,
  maxResults = 5
): Promise<YouTubePlaylistSearchResult[]> {
  const url = `/api/youtube-playlist-search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Playlist search failed (${res.status})`);
  return Array.isArray(data.playlists) ? data.playlists : [];
}
