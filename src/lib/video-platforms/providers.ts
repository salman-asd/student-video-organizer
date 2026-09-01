import type { VideoPlatform } from "@/types";
import type { NormalizedVideoUrl, VideoUrlProvider } from "./types";
import { parseVideoUrl } from "./types";

function toInputUrl(rawUrl: string): string {
  return rawUrl.trim();
}

function buildNormalizedResult(
  rawUrl: string,
  platform: VideoPlatform,
  canonicalUrl: string,
  originalWatchUrl: string | null,
  embedUrl: string | null,
  externalVideoId: string | null,
): NormalizedVideoUrl {
  const normalized = canonicalUrl || originalWatchUrl || rawUrl.trim();
  return {
    platform,
    inputUrl: rawUrl.trim(),
    normalizedUrl: normalized,
    canonicalUrl: canonicalUrl || normalized,
    originalWatchUrl: originalWatchUrl ?? null,
    embedUrl,
    externalVideoId,
    isValid: true,
    isShortened: normalized !== rawUrl.trim(),
  };
}

export class YouTubeVideoProvider implements VideoUrlProvider {
  platform: VideoPlatform = "youtube";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") return true;
    if (host.includes("youtube.com") || host.includes("youtube-nocookie.com")) {
      const path = parsed.pathname.toLowerCase();
      return path === "/watch" || path === "/embed" || path === "/v" || path.startsWith("/shorts/") || path.startsWith("/embed/") || path.startsWith("/v/");
    }
    return false;
  }

  extractVideoId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;

    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host === "youtu.be") {
      const id = path.replace(/^\//, "").split("/")[0];
      return id && /^[A-Za-z0-9_-]{6,}$/i.test(id) ? id : null;
    }

    if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");

    const shortMatch = path.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/i);
    if (shortMatch) return shortMatch[1];

    const embedMatch = path.match(/^\/embed\/([A-Za-z0-9_-]{6,})/i);
    if (embedMatch) return embedMatch[1];

    const embeddedMatch = path.match(/^\/v\/([A-Za-z0-9_-]{6,})/i);
    if (embeddedMatch) return embeddedMatch[1];

    return null;
  }

  canonicalUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  embedUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}`;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;

    const canonicalUrl = this.canonicalUrl(url)!;
    const originalWatchUrl = this.originalWatchUrl(url)!;
    const embedUrl = this.embedUrl(url) ?? null;
    const isShortened = /youtu\.be|\/shorts\//i.test(url);

    return {
      platform: this.platform,
      inputUrl: toInputUrl(url),
      normalizedUrl: canonicalUrl,
      canonicalUrl,
      originalWatchUrl,
      embedUrl,
      externalVideoId: videoId,
      isValid: true,
      isShortened,
    };
  }
}

export class YouTubeShortsProvider implements VideoUrlProvider {
  platform: VideoPlatform = "youtube-shorts";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("youtube.com") && host !== "youtu.be") return false;
    return parsed.pathname.toLowerCase().startsWith("/shorts/");
  }

  extractVideoId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;
    const match = parsed.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{6,})/i);
    return match ? match[1] : null;
  }

  canonicalUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  embedUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://www.youtube.com/embed/${videoId}`;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    const canonicalUrl = this.canonicalUrl(url)!;
    return buildNormalizedResult(url, this.platform, canonicalUrl, canonicalUrl, this.embedUrl(url), videoId);
  }
}

// Facebook video URLs come in two shapes:
//  (a) "long-form" links that already carry a numeric video ID we can read
//      client-side: /watch/?v=123, /videos/123, /video.php?v=123, /reel/123.
//  (b) "short-form" share links whose path segment is an opaque token, not
//      the numeric ID: fb.watch/xXXXXXXXXX, /share/v/xXXXXXXXXX/,
//      /share/r/xXXXXXXXXX/. Resolving these to a real video ID requires
//      following Facebook's HTTP redirect — a plain fetch, no Graph API
//      needed — which can only safely happen server-side (see
//      resolveFacebookRedirectUrl in facebookGraph.ts; browsers can't read
//      the Location header of a cross-origin redirect). detect() still
//      recognizes these as Facebook so the UI treats them as a pending
//      Facebook video instead of misclassifying them as "generic", and
//      normalize() reports them valid-but-unresolved so the paste-a-URL
//      flow doesn't reject them outright.
const FACEBOOK_SHORT_LINK_HOSTS = new Set(["fb.watch"]);

export class FacebookVideoProvider implements VideoUrlProvider {
  platform: VideoPlatform = "facebook";

  private isShortShareLink(parsed: URL): boolean {
    const host = parsed.hostname.toLowerCase();
    if (FACEBOOK_SHORT_LINK_HOSTS.has(host)) return true;
    if (host !== "facebook.com" && host !== "www.facebook.com" && host !== "m.facebook.com") return false;
    const pathname = parsed.pathname.toLowerCase();
    return pathname.startsWith("/share/v/") || pathname.startsWith("/share/r/");
  }

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();

    if (FACEBOOK_SHORT_LINK_HOSTS.has(host)) return true;
    if (host !== "facebook.com" && host !== "www.facebook.com" && host !== "m.facebook.com") return false;

    const pathname = parsed.pathname.toLowerCase();
    const hasVideoQuery = parsed.searchParams.get("v");
    return (
      pathname.includes("/videos/") ||
      pathname.includes("/watch/") ||
      pathname.includes("/video.php") ||
      pathname.startsWith("/reel/") ||
      pathname.startsWith("/share/v/") ||
      pathname.startsWith("/share/r/") ||
      Boolean(hasVideoQuery)
    );
  }

  extractVideoId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;

    if (this.isShortShareLink(parsed)) return null;

    const videoQuery = parsed.searchParams.get("v");
    if (videoQuery && /^\d{5,}$/.test(videoQuery)) return videoQuery;

    const pathMatch = parsed.pathname.match(/\/videos\/(\d+)/i) || parsed.pathname.match(/\/watch\/?$/i) && parsed.searchParams.get("v");
    if (pathMatch) return pathMatch[1] ?? parsed.searchParams.get("v");

    const reelMatch = parsed.pathname.match(/\/reel\/(\d+)/i);
    if (reelMatch) return reelMatch[1];

    if (parsed.pathname.toLowerCase().includes("/video.php")) {
      const id = parsed.searchParams.get("v");
      if (id) return id;
    }

    const hrefMatch = parsed.searchParams.get("href");
    if (hrefMatch) {
      const nested = parseVideoUrl(hrefMatch);
      if (nested) {
        const nestedId = this.extractVideoId(nested.toString());
        if (nestedId) return nestedId;
      }
    }

    return null;
  }

  private isReelPath(pathname: string): boolean {
    return pathname.toLowerCase().startsWith("/reel/");
  }

  /**
   * Reel and non-Reel Facebook video URLs are NOT interchangeable for
   * anything downstream (oEmbed metadata, the plugins/video.php player
   * embed) — a Reel forced into `/watch/?v=` shape doesn't error, it just
   * silently degrades: oEmbed falls back to a generic "blockquote" (link +
   * caption, no real title/thumbnail — see facebookGraph.ts), and the
   * video.php iframe embed renders a black player instead of the video.
   * Meta's own official "Meta Embeds" WordPress plugin
   * (github.com/facebook/meta-embeds-for-wordpress) documents Reels as
   * needing their own `/reel/{reel-id}/` shape specifically, distinct from
   * `/watch/?v=`.
   *
   * So canonicalUrl() preserves that distinction instead of collapsing
   * everything to `/watch/?v=`: a Reel's canonical (and thus *stored*, per
   * the videoUrl field every other call in this file/route ultimately
   * derives from) URL stays `/reel/{id}/`; anything else still normalizes
   * to `/watch/?v={id}`. Every other Facebook URL shape this class
   * recognizes (/videos/, /video.php, /watch/?v=, /watch/, an `href=`
   * query wrapper) is treated as "not a Reel" and takes the `/watch/?v=`
   * form, matching the previous behavior for those shapes.
   */
  canonicalUrl(url: string): string | null {
    const parsed = parseVideoUrl(url);
    const videoId = this.extractVideoId(url);
    if (!parsed || !videoId) return null;

    if (this.isReelPath(parsed.pathname)) {
      return `https://www.facebook.com/reel/${videoId}/`;
    }
    return `https://www.facebook.com/watch/?v=${videoId}`;
  }

  /**
   * The URL shape to send to Facebook's oEmbed Video endpoint. Now just an
   * alias for canonicalUrl() — kept as its own named method (rather than
   * inlining `generateCanonicalUrl` calls at oEmbed call sites) so the
   * "this is the URL oEmbed needs" intent stays documented at the call
   * site even though the shape logic itself now lives in one place.
   * Historically this used to carry its own separate Reel-detection logic
   * that canonicalUrl() didn't share, which is exactly what let the two
   * drift apart and produce a working oEmbed response alongside a broken
   * (`/watch/?v=`-only) player embed for the same Reel — see canonicalUrl's
   * doc comment. Single source of truth avoids that recurring.
   */
  oEmbedUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  /**
   * plugins/video.php's `href` needs the *same* Reel-vs-watch shape
   * distinction as oEmbed (see canonicalUrl's doc comment) — a Reel's
   * player embed only renders when `href` points at the Reel's own
   * `/reel/{id}/` URL, not a `/watch/?v=` rewrite of the same id. Because
   * canonicalUrl() is now Reel-aware, this falls out automatically: no
   * separate Reel branch needed here, and (critically) this stays correct
   * however far downstream this is called from — including the common
   * case of the *stored* videoUrl (already itself a canonicalUrl() result)
   * being re-normalized here at render time, long after the original
   * `/reel/` vs `/watch/` input shape would otherwise have been lost.
   */
  embedUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    const playableUrl = this.canonicalUrl(url)!;
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(playableUrl)}&show_text=false`;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const parsed = parseVideoUrl(url);
    const videoId = this.extractVideoId(url);

    if (videoId) {
      const canonicalUrl = this.canonicalUrl(url)!;
      return buildNormalizedResult(url, this.platform, canonicalUrl, canonicalUrl, this.embedUrl(url), videoId);
    }

    // Recognized-but-unresolved short link: still "valid" from the UI's
    // perspective (it's a real Facebook video URL), just missing the fields
    // that require the server-side redirect resolution step.
    if (parsed && this.isShortShareLink(parsed)) {
      const trimmed = url.trim();
      return buildNormalizedResult(url, this.platform, trimmed, trimmed, null, null);
    }

    return null;
  }
}

export class VimeoVideoProvider implements VideoUrlProvider {
  platform: VideoPlatform = "vimeo";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
      const pathname = parsed.pathname;
      const match = pathname.match(/^\/(?:video\/)?(\d+)(?:\/.*)?$/i);
      return Boolean(match) || Boolean(parsed.searchParams.get("video_id"));
    }
    return false;
  }

  extractVideoId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;

    const directMatch = parsed.pathname.match(/^\/(?:video\/)?(\d+)(?:\/.*)?$/i);
    if (directMatch) return directMatch[1];

    const playerMatch = parsed.pathname.match(/^\/video\/(\d+)/i);
    if (playerMatch) return playerMatch[1];

    const queryId = parsed.searchParams.get("video_id");
    if (queryId && /^\d+$/.test(queryId)) return queryId;

    return null;
  }

  canonicalUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://vimeo.com/${videoId}`;
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  embedUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://player.vimeo.com/video/${videoId}`;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    const canonicalUrl = this.canonicalUrl(url)!;
    return buildNormalizedResult(url, this.platform, canonicalUrl, canonicalUrl, this.embedUrl(url), videoId);
  }
}

export class GenericVideoProvider implements VideoUrlProvider {
  platform: VideoPlatform = "generic";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    return Boolean(host) && parsed.protocol === "https:";
  }

  extractVideoId(url: string): string | null {
    return null;
  }

  canonicalUrl(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;
    return parsed.toString();
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  embedUrl(url: string): string | null {
    return null;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;
    const canonicalUrl = parsed.toString();
    return {
      platform: this.platform,
      inputUrl: toInputUrl(url),
      normalizedUrl: canonicalUrl,
      canonicalUrl,
      originalWatchUrl: canonicalUrl,
      embedUrl: null,
      externalVideoId: null,
      isValid: true,
      isShortened: false,
    };
  }
}

export const videoPlatformProviders: VideoUrlProvider[] = [
  new YouTubeShortsProvider(),
  new YouTubeVideoProvider(),
  new FacebookVideoProvider(),
  new VimeoVideoProvider(),
  new GenericVideoProvider(),
];

// Reused directly (rather than re-instantiated) by generateFacebookOEmbedUrl
// below, since oEmbedUrl() is specific to FacebookVideoProvider and isn't
// part of the generic VideoUrlProvider interface every other provider
// implements.
const facebookVideoProvider = videoPlatformProviders.find(
  (p): p is FacebookVideoProvider => p instanceof FacebookVideoProvider
)!;

/**
 * The URL shape to hand to Facebook's oEmbed Video endpoint (see
 * FacebookVideoProvider.oEmbedUrl for why this differs from
 * generateCanonicalUrl for Reels). Returns null for any non-Facebook URL.
 */
export function generateFacebookOEmbedUrl(url: string): string | null {
  return facebookVideoProvider.oEmbedUrl(url);
}

function isKnownVideoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.includes("youtube.com") ||
    host === "youtu.be" ||
    host.includes("facebook.com") ||
    host === "fb.watch" ||
    host.includes("vimeo.com")
  );
}

export function detectVideoProvider(url: string): VideoUrlProvider | null {
  const parsed = parseVideoUrl(url);
  if (!parsed) return null;

  const provider = videoPlatformProviders
    .filter((item) => item.platform !== "generic")
    .find((item) => item.detect(url));

  if (provider) return provider;

  if (isKnownVideoHost(parsed.hostname)) return null;

  return new GenericVideoProvider();
}