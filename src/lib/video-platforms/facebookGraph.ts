/**
 * ─────────────────────────────────────────────────────────────────────────
 * FACEBOOK: WHEN THE GRAPH API IS ACTUALLY NEEDED
 * ─────────────────────────────────────────────────────────────────────────
 * Facebook video support intentionally mirrors the YouTube integration's
 * shape (a public, no-auth mechanism where one exists; the Graph API only
 * where Facebook requires it), but the split lands in a different place:
 *
 *   1. Resolving a short share link (fb.watch/xxxx, /share/v/xxxx/) to its
 *      canonical, ID-bearing URL — a PUBLIC mechanism. It's just following
 *      an HTTP redirect, same as any short link. No Graph API, no token.
 *
 *   2. Playing a public video in-app — a PUBLIC mechanism. Facebook's
 *      "plugins/video.php" iframe embed works for any public video URL
 *      with zero auth (see providers.ts embedUrl()), exactly like the
 *      YouTube iframe embed.
 *
 *   3. Fetching metadata (title, thumbnail, author, duration) for a pasted
 *      video URL — REQUIRES the Graph API. Facebook shut down its old
 *      anonymous oEmbed endpoint; the replacement (`/oembed_video`) is a
 *      Graph API edge that requires an app access token even for public
 *      videos. This is the one case where Facebook needs more than YouTube
 *      did (YouTube's oEmbed stays fully public). It's still not a *user*
 *      access token, though — a server-held app token (`APP_ID|APP_SECRET`)
 *      is enough, so nothing here asks a student to log into Facebook.
 *
 *   4. Listing the videos inside a Facebook "collection" (a Page's Video
 *      Library playlist / video_list) — REQUIRES the Graph API, and
 *      requires more than an app token: enumerating a Page's video list
 *      needs a Page access token with video read permission. There is no
 *      public URL/embed equivalent to "give me every video in this list",
 *      the same way there's no way to scrape a YouTube playlist without
 *      the Data API. This is the Facebook analogue of
 *      YOUTUBE_API_KEY + playlist.ts's YouTubePlaylistProvider.
 *
 * All of this only ever runs on the server (API routes under
 * src/app/api/facebook-*), the same way YOUTUBE_API_KEY never reaches the
 * browser in youtubeDuration.ts / playlist.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface FacebookVideoMetadata {
  title: string;
  authorName: string | null;
  thumbnailUrl: string | null;
  html: string | null;
}

export interface FacebookCollectionVideo {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  description: string | null;
  publishedAt: string | null;
}

export interface FacebookCollectionPreview {
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  totalVideos: number;
  videos: FacebookCollectionVideo[];
}

function getAppAccessToken(): string | null {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) return null;
  // Facebook's "app access token" needs no network round trip — it's
  // deterministically the app id and secret joined with a pipe. This is
  // the credential the Graph API accepts for reading public content
  // (oEmbed, public Page fields); it is never a user's personal token.
  return `${appId}|${appSecret}`;
}

/**
 * Follows Facebook's short-link redirect (fb.watch, /share/v/, /share/r/)
 * server-side and returns the final, ID-bearing URL. Plain HTTP — no Graph
 * API, no credentials — because a public mechanism is sufficient here.
 */
export async function resolveFacebookRedirectUrl(shortUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shortUrl, { method: "GET", redirect: "follow" });
    // `res.url` is the final URL after following every hop, whether or not
    // the response body itself is useful — that's all this needs.
    return res.url || null;
  } catch {
    return null;
  }
}

/**
 * Calls the Graph API's oEmbed Video endpoint. Requires an app access
 * token (see module doc, case 3) even though the video itself is public.
 * Returns null (never throws) on missing config, private/unavailable
 * videos, or any request failure, so callers can fall back to the same
 * manual-entry UX already used for other unfetchable metadata.
 */
export async function fetchFacebookVideoOEmbed(canonicalVideoUrl: string): Promise<FacebookVideoMetadata | null> {
  const accessToken = getAppAccessToken();
  if (!accessToken) return null;

  try {
    const endpoint = new URL("https://graph.facebook.com/v19.0/oembed_video");
    endpoint.searchParams.set("url", canonicalVideoUrl);
    endpoint.searchParams.set("access_token", accessToken);
    endpoint.searchParams.set("omitscript", "true");

    const res = await fetch(endpoint.toString(), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== "object") return null;

    return {
      title: data.title || "Untitled video",
      authorName: data.author_name || null,
      thumbnailUrl: data.thumbnail_url || null,
      html: data.html || null,
    };
  } catch {
    return null;
  }
}

/** Extracts a Page's Video Library "video_list" id from a collection URL.
 *  Facebook doesn't document a single stable pattern the way YouTube's
 *  `?list=` param is documented, so this accepts the two shapes actually
 *  seen in the wild: a `video_list_id` query param, or the numeric id as
 *  the last path segment of `/{page}/videos/collection/{video_list_id}`. */
export function extractFacebookCollectionId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromQuery = parsed.searchParams.get("video_list_id") || parsed.searchParams.get("list_id");
    if (fromQuery) return fromQuery;

    const match = parsed.pathname.match(/\/videos\/collection\/(\d+)/i);
    if (match) return match[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Lists the videos in a Facebook Page's video collection/playlist. Always
 * requires the Graph API plus a Page access token (see module doc, case
 * 4) — there is no public equivalent. Throws with a user-facing message on
 * missing config or a failed request, mirroring
 * YouTubePlaylistProvider.fetchPreview's error handling so the "Import
 * Playlist / Collection" UI can show it directly.
 */
export async function fetchFacebookCollection(url: string): Promise<FacebookCollectionPreview> {
  const collectionId = extractFacebookCollectionId(url);
  if (!collectionId) {
    throw new Error("This does not look like a valid Facebook collection URL.");
  }

  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageAccessToken) {
    throw new Error("Facebook collection import requires FACEBOOK_PAGE_ACCESS_TOKEN to be configured on the server.");
  }

  const fields = "name,description,videos.limit(200){id,title,description,length,picture,permalink_url,updated_time}";
  const endpoint = new URL(`https://graph.facebook.com/v19.0/${collectionId}`);
  endpoint.searchParams.set("fields", fields);
  endpoint.searchParams.set("access_token", pageAccessToken);

  const res = await fetch(endpoint.toString(), { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Unable to read this Facebook collection.");
  }

  const rawVideos: any[] = data?.videos?.data || [];
  const videos: FacebookCollectionVideo[] = rawVideos
    .filter((item) => item?.id && item?.permalink_url)
    .map((item) => ({
      id: item.id,
      title: item.title || "Untitled video",
      videoUrl: `https://www.facebook.com/watch/?v=${item.id}`,
      thumbnailUrl: item.picture || "",
      durationSeconds: typeof item.length === "number" ? Math.round(item.length) : null,
      description: item.description || null,
      publishedAt: item.updated_time || null,
    }));

  return {
    title: data?.name || "Imported collection",
    description: data?.description || null,
    thumbnailUrl: videos[0]?.thumbnailUrl || null,
    totalVideos: videos.length,
    videos,
  };
}
