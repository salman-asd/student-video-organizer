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
 *   3. Fetching metadata for a pasted video URL — the *lookup* is a PUBLIC
 *      mechanism as of 15 June 2026 (Meta made `/oembed_video` tokenless,
 *      no App Review needed), but as of 3 Nov 2025 Meta permanently
 *      removed `thumbnail_url`, `author_name`, `author_url`, and the
 *      thumbnail dimension fields from what oEmbed returns at all — for
 *      every caller, tokened or not. That's not a config problem on our
 *      end; there's no request shape that brings those fields back. Per
 *      Meta's own migration guidance, title/thumbnail now come from
 *      reading Open Graph tags (`og:title`, `og:image`) directly off the
 *      public video page's HTML instead — see
 *      fetchFacebookOpenGraphTags's doc comment. oEmbed is still used
 *      alongside that for the `html` embed fragment, which it does still
 *      provide. fetchFacebookVideoOEmbed still checks oEmbed's own
 *      `thumbnail_url`/`title` fields first, defensively, in case that
 *      removal doesn't hold for every URL shape or account — see its doc
 *      comment for the full fallback order.
 *
 *   4. Listing the videos inside a Facebook "collection" (a Page's Video
 *      Library playlist / video_list) — still REQUIRES the Graph API with
 *      a Page access token. oEmbed is a single-URL-in, single-embed-out
 *      contract (per Meta's own migration notes) — there's no oEmbed edge
 *      for "give me every video in this list", same as there's no way to
 *      scrape a YouTube playlist without the Data API. This is the
 *      Facebook analogue of YOUTUBE_API_KEY + playlist.ts's
 *      YouTubePlaylistProvider, and the tokenless change above doesn't
 *      touch it.
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
 * Reads Open Graph tags (og:title, og:image, og:description) directly off
 * a public Facebook video/Reel page's HTML. This is Meta's own sanctioned
 * workaround for the gap below: since 3 Nov 2025 the oEmbed endpoints no
 * longer return thumbnail_url/author_name/etc at all (a permanent field
 * removal, not a bug — see fetchFacebookVideoOEmbed's doc comment), and
 * Meta's migration notice explicitly recommends generating thumbnails
 * directly from the HTML metadata of the original post as the
 * replacement. This is exactly how link-preview unfurling already works
 * everywhere (Slack, iMessage, Discord previews of Facebook links all
 * read these same tags) — it's public metadata Facebook publishes on the
 * page itself, not an authenticated API.
 *
 * Uses the `facebookexternalhit` user agent because Facebook only serves
 * the OG-tagged version of the page to requests it recognizes as a
 * crawler; a normal browser UA gets redirected to a login wall with no
 * usable tags. This is the same UA every other unfurling tool uses for
 * this exact purpose, not a bypass of anything Facebook doesn't already
 * expect external services to do.
 *
 * Best-effort and unofficial (there's no documented contract here, just
 * observed behavior Meta itself points developers toward) — returns null
 * on any failure so callers always have the oEmbed-only result to fall
 * back to.
 */
async function fetchFacebookOpenGraphTags(pageUrl: string): Promise<{ title: string | null; thumbnailUrl: string | null } | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();

    const title = extractOpenGraphTag(html, "og:title");
    const thumbnailUrl = extractOpenGraphTag(html, "og:image");
    if (!title && !thumbnailUrl) return null;

    return { title, thumbnailUrl };
  } catch {
    return null;
  }
}

/** Facebook's markup isn't consistent about attribute order on <meta>
 *  tags, so this checks both `property` then `content` and the reverse. */
function extractOpenGraphTag(html: string, property: string): string | null {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${escapedProperty}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${escapedProperty}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }
  return null;
}

/**
 * Guards against ever saving a Facebook *webpage* URL (facebook.com,
 * m.facebook.com, fb.watch) as a thumbnail — a plain image URL is what
 * every caller of this (VideoCard, VideoPlayer poster, etc.) actually
 * needs, and a page link there would render broken. Real Facebook
 * thumbnail/image assets come off `*.fbcdn.net` or
 * `platform-lookaside.fbsbx.com` (see FACEBOOK_SETUP.md), never off
 * facebook.com itself, so this is a cheap, specific check rather than a
 * generic "is this an image" heuristic. Also rejects anything that isn't
 * a parseable absolute URL at all.
 */
function sanitizeFacebookThumbnailUrl(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    if (host === "facebook.com" || host === "www.facebook.com" || host === "m.facebook.com" || host === "fb.watch") {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * Decodes HTML entities Facebook's API embeds in caption/title text —
 * both named entities (&amp;, &quot;, ...) and numeric character
 * references, decimal (&#2361;) and hex (&#x928;, &#xb7;). The hex form
 * specifically is where the previous version of this function fell short:
 * it only handled a handful of named entities, so any non-ASCII caption
 * text Facebook returns entity-encoded (Devanagari, Arabic, emoji, or
 * even just a plain "&#xb7;" middle dot in an engagement-stats prefix)
 * passed through completely undecoded — visible as raw "&#x928;"-style
 * text, and also silently breaking any later regex written against the
 * literal character (e.g. matching "·" against text that still says
 * "&#xb7;"). &amp; is decoded last, as usual for HTML entity decoders, so
 * a literal "&" produced by an earlier numeric/named decode isn't
 * re-interpreted as the start of another entity.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * When Facebook can't (or won't) resolve full oEmbed data for a URL, the
 * `html` field it still returns isn't empty — it's a generic fallback
 * `<blockquote>` with the post's caption in a `<p>` tag (sometimes
 * duplicated or replaced by an `<a>` whose link text is the caption) and
 * the poster's name in a "Posted by <a>...</a>" link (see the raw response
 * you get back from `/watch/?v=` or `/reel/{id}/` URLs). That's free,
 * already-fetched data sitting in a field we were otherwise only using for
 * the embed fragment — worth reading instead of only relying on the
 * separate OG-tag scrape. It never carries an image, though, so
 * thumbnailUrl still only ever comes from fetchFacebookOpenGraphTags (or
 * oEmbed's own thumbnail_url, on the off chance Facebook returns one — see
 * fetchFacebookVideoOEmbed).
 */
function parseFacebookFallbackHtml(html: string): { caption: string | null; pageName: string | null; authorName: string | null } {
  const authorMatch = html.match(/Posted by\s*<a[^>]*>([^<]*)<\/a>/i);
  const authorName = authorMatch?.[1] ? decodeHtmlEntities(authorMatch[1]).trim() || null : null;

  const captionMatch = html.match(/<p>(.*?)<\/p>/is);
  let captionSource = captionMatch?.[1] ? stripTags(captionMatch[1]).trim() : "";

  // Some fallback markup carries the caption/title inside an <a> instead
  // of (or in addition to) a <p> — e.g. a link whose text is the post's
  // title. Skip the "Posted by" author link itself (already captured
  // above) and use the first other <a> with real text as a second source.
  if (!captionSource) {
    const authorText = authorMatch?.[1]?.trim();
    for (const match of html.matchAll(/<a[^>]*>([^<]*)<\/a>/gi)) {
      const text = match[1]?.trim();
      if (text && text !== authorText) {
        captionSource = text;
        break;
      }
    }
  }

  if (!captionSource) return { caption: null, pageName: null, authorName };

  const { title, pageName } = parseFacebookTitleText(decodeHtmlEntities(captionSource));
  return { caption: title, pageName, authorName };
}

function stripTags(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

// A single stat word with its number — "354K views", "4.3K reactions",
// "12 comments". The leading segment of a title/caption is often TWO of
// these joined by "·" in one "|"-delimited chunk (e.g.
// "354K views · 4.3K reactions"), not one stat per segment, so
// FACEBOOK_STATS_SEGMENT below matches one-or-more of these joined by ·/•
// as a whole, not just a single stat.
const FACEBOOK_STAT_SUBPART = /[\d.,]+\s*[KMB]?\+?\s*(?:views?|reactions?|likes?|comments?|shares?)/i;
const FACEBOOK_STAT_SEGMENT = new RegExp(`^${FACEBOOK_STAT_SUBPART.source}(?:\\s*[·•]\\s*${FACEBOOK_STAT_SUBPART.source})*$`, "i");

/**
 * Facebook's title/caption text for a video or Reel post commonly arrives
 * as up to three "|"-separated segments, e.g.:
 *
 *   "354K views · 4.3K reactions | Actual Video Title, in any language |
 *   Posting Page Or Profile Name"
 *
 * — engagement stats, the real caption/title (which may itself contain a
 * legitimate "|" or non-English/mixed-script text — see decodeHtmlEntities
 * for why that text needs to already be entity-decoded before this runs),
 * and the posting Page/profile's display name. Only the middle portion is
 * an actual title; the first is noise and the last belongs in authorName,
 * not the title — see fetchFacebookVideoOEmbed for how the extracted
 * pageName is used as a last-resort author fallback.
 *
 * Splits on every "|", drops a leading segment that's purely engagement
 * stats (if there is one), then — when more than one segment remains —
 * treats the last as the Page name and rejoins everything else as the
 * title (so a genuine "|" inside the real title is preserved instead of
 * being cut at the first pipe). A title with no "|" at all, or one where
 * nothing looks like a stats/page wrapper, is returned unchanged.
 */
function parseFacebookTitleText(rawText: string): { title: string | null; pageName: string | null } {
  const trimmed = rawText.trim();
  if (!trimmed) return { title: null, pageName: null };

  const segments = trimmed.split("|").map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return { title: segments[0] ?? trimmed, pageName: null };

  if (FACEBOOK_STAT_SEGMENT.test(segments[0])) {
    segments.shift();
  }

  if (segments.length <= 1) {
    return { title: segments[0] ?? trimmed, pageName: null };
  }

  const pageName = segments[segments.length - 1];
  const title = segments.slice(0, -1).join(" | ").trim();
  return { title: title || pageName, pageName: pageName || null };
}

/**
 * Calls the Graph API's oEmbed Video endpoint for the `html` embed
 * fragment (tokenless since Meta's 15 June 2026 change — see module doc,
 * case 3), then separately reads Open Graph tags off the public page for
 * title/thumbnail, because oEmbed's own JSON fields no longer carry that
 * data — see fetchFacebookOpenGraphTags's doc comment for why. `ogPageUrl`
 * is the URL to scrape for those tags; pass the plain canonical
 * `/watch/?v=` (or original `/reel/`) URL here, since — unlike
 * oEmbedVideoUrl — this fetch isn't sensitive to which Facebook URL shape
 * you use.
 *
 * Title/author priority: og:title/og:image (richest source, but
 * unofficial scraping — see fetchFacebookOpenGraphTags) → the caption/
 * author text embedded in oEmbed's own fallback `html` (official,
 * already-fetched, just underused) → oEmbed's JSON title field (rarely
 * populated for Facebook video/Reel posts, kept as a last resort). Every
 * one of those raw text sources gets run through parseFacebookTitleText,
 * since Facebook's "354K views · 4.3K reactions | Actual Title | Page
 * Name" three-segment shape (see its doc comment) can show up in any of
 * them, not just one. authorName prefers oEmbed's own `author_name` field
 * and the fallback html's "Posted by" text (both explicit, structured
 * author fields) over a title's trailing pageName segment (an inferred
 * guess); pageName is only used when nothing more explicit was found.
 *
 * The returned `title` is then `"<cleaned title> | <authorName>"` — the
 * requested display format — when an author was resolved, or just the
 * cleaned title when it wasn't; never a bare "Untitled video" when an
 * author is known, and never a trailing "| " with nothing after it.
 *
 * Thumbnail priority: oEmbed's own `thumbnail_url` field, in case Meta's
 * removal of that field (see module doc, case 3) doesn't apply to every
 * URL shape or gets reversed → og:image from the page scrape. Both are
 * run through sanitizeFacebookThumbnailUrl so a Facebook webpage URL
 * never ends up saved as a "thumbnail". There's no further unauthenticated
 * Graph API fallback for a single arbitrary video URL beyond these two —
 * the Graph API's richer image fields need either a User/Page access
 * token scoped to that content or the video's own object id, neither of
 * which is available from just a pasted public URL (contrast
 * fetchFacebookCollection below, which *does* have a Page token and a
 * real object id to query `picture` from).
 *
 * Returns null (never throws) only when every source fails entirely, so
 * callers can fall back to the same manual-entry UX already used for
 * other unfetchable metadata; a partial result (e.g. html but no title)
 * is still returned since "Untitled video" + a working embed is more
 * useful than nothing.
 */
export async function fetchFacebookVideoOEmbed(oEmbedVideoUrl: string, ogPageUrl: string = oEmbedVideoUrl): Promise<FacebookVideoMetadata | null> {
  try {
    const endpoint = new URL("https://graph.facebook.com/v25.0/oembed_video");
    endpoint.searchParams.set("url", oEmbedVideoUrl);
    endpoint.searchParams.set("omitscript", "true");

    const [oEmbedResult, ogTags] = await Promise.all([
      fetch(endpoint.toString(), { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) {
            const errorBody = await res.text().catch(() => "");
            console.error(`[facebook-video] oembed_video request failed (${res.status}):`, errorBody);
            return null;
          }
          return res.json().catch(() => null);
        })
        .catch((err) => {
          console.error(`[facebook-video] oembed_video request threw for "${oEmbedVideoUrl}":`, err);
          return null;
        }),
      fetchFacebookOpenGraphTags(ogPageUrl),
    ]);

    console.log(`[facebook-video] oEmbed result present=${Boolean(oEmbedResult)} ogTags present=${Boolean(ogTags)} for "${oEmbedVideoUrl}"`);

    if (!oEmbedResult && !ogTags) return null;

    const ogParsed = ogTags?.title ? parseFacebookTitleText(ogTags.title) : null;
    const fallback = oEmbedResult?.html ? parseFacebookFallbackHtml(oEmbedResult.html) : null;
    const rawOEmbedParsed = typeof oEmbedResult?.title === "string" ? parseFacebookTitleText(oEmbedResult.title) : null;

    const cleanTitle = ogParsed?.title || fallback?.caption || rawOEmbedParsed?.title || null;
    const authorName =
      oEmbedResult?.author_name ||
      fallback?.authorName ||
      ogParsed?.pageName ||
      fallback?.pageName ||
      rawOEmbedParsed?.pageName ||
      null;

    // Requested display format: "<title> | <authorName>" — the cleaned
    // title (stats and any embedded page-name segment already stripped
    // by parseFacebookTitleText above) with the resolved author/Page name
    // appended back on with " | ", rather than the raw un-stripped
    // Facebook string, and rather than dropping the author out of the
    // title entirely. Only appended when an author was actually found;
    // never produces a title ending in a bare "| " with nothing after it.
    const title = cleanTitle
      ? (authorName ? `${cleanTitle} | ${authorName}` : cleanTitle)
      : (authorName ? `Untitled video | ${authorName}` : "Untitled video");

    const thumbnailUrl =
      sanitizeFacebookThumbnailUrl(oEmbedResult?.thumbnail_url) || sanitizeFacebookThumbnailUrl(ogTags?.thumbnailUrl);
    if (!thumbnailUrl) {
      console.warn(`[facebook-video] no usable thumbnail_url/og:image for "${oEmbedVideoUrl}" (or the only candidate was a Facebook page URL, which was discarded)`);
    }

    console.log(`[facebook-video] extracted metadata for "${oEmbedVideoUrl}": title="${title}" authorName="${authorName ?? "(none)"}" thumbnailUrl="${thumbnailUrl ?? "(none)"}"`);

    return {
      title,
      authorName,
      thumbnailUrl,
      html: oEmbedResult?.html || null,
    };
  } catch (err) {
    console.error(`[facebook-video] fetchFacebookVideoOEmbed failed unexpectedly for "${oEmbedVideoUrl}":`, err);
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

  // Query the collection itself as a Graph node (its id is the
  // video_list_id/list_id extracted above) — not the oembed_video edge,
  // which only ever resolves a single video URL and has no "fields" param
  // or awareness of a Page's video list.
  const fields = "name,description,videos.limit(200){id,title,description,length,picture,permalink_url,updated_time}";
  const endpoint = new URL(`https://graph.facebook.com/v25.0/${collectionId}`);
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