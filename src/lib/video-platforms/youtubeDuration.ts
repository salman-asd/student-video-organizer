/**
 * YouTube's public oEmbed endpoint (used for single-video "paste a URL"
 * metadata) and the playlistItems API (used for playlist import) both omit
 * video duration — it only exists on the separate `videos` resource's
 * `contentDetails.duration` field (ISO 8601, e.g. "PT15M33S"), which
 * requires the official Data API v3 and an API key. This is server-only.
 */

export function parseIso8601Duration(iso: string): number | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : (iso === "PT0S" ? 0 : null);
}

/** Batches requests in groups of 50 (the YouTube Data API's per-request id
 *  limit). Returns whatever succeeded plus the last error encountered, so
 *  callers can show the *actual* reason (bad key, quota, API not enabled,
 *  key restricted to the wrong API, etc.) instead of a generic guess. */
export async function fetchYouTubeDurations(
  videoIds: string[]
): Promise<{ durations: Record<string, number>; error: string | null }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return { durations: {}, error: "YOUTUBE_API_KEY is not set on the server." };
  if (videoIds.length === 0) return { durations: {}, error: null };

  const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
  const durations: Record<string, number> = {};
  let error: string | null = null;

  for (let start = 0; start < uniqueIds.length; start += 50) {
    const batch = uniqueIds.slice(start, start + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "contentDetails");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);

    try {
      const res = await fetch(url.toString(), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        error = data?.error?.message || `YouTube API request failed (${res.status})`;
        continue;
      }
      (data.items || []).forEach((item: any) => {
        const seconds = item?.contentDetails?.duration ? parseIso8601Duration(item.contentDetails.duration) : null;
        if (item?.id && seconds !== null) durations[item.id] = seconds;
      });
    } catch (e: any) {
      error = e?.message || "Network error contacting the YouTube Data API";
    }
  }

  return { durations, error };
}
