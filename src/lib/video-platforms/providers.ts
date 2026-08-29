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

export class FacebookVideoProvider implements VideoUrlProvider {
  platform: VideoPlatform = "facebook";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (host !== "facebook.com" && host !== "www.facebook.com" && host !== "m.facebook.com") return false;

    const pathname = parsed.pathname.toLowerCase();
    const hasVideoQuery = parsed.searchParams.get("v");
    return pathname.includes("/videos/") || pathname.includes("/watch/") || pathname.includes("/video.php") || Boolean(hasVideoQuery);
  }

  extractVideoId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;

    const videoQuery = parsed.searchParams.get("v");
    if (videoQuery && /^\d{5,}$/.test(videoQuery)) return videoQuery;

    const pathMatch = parsed.pathname.match(/\/videos\/(\d+)/i) || parsed.pathname.match(/\/watch\/?$/i) && parsed.searchParams.get("v");
    if (pathMatch) return pathMatch[1] ?? parsed.searchParams.get("v");

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

  canonicalUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    return `https://www.facebook.com/watch/?v=${videoId}`;
  }

  originalWatchUrl(url: string): string | null {
    return this.canonicalUrl(url);
  }

  embedUrl(url: string): string | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    const watchUrl = this.canonicalUrl(url)!;
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(watchUrl)}&show_text=false`;
  }

  normalize(url: string): NormalizedVideoUrl | null {
    const videoId = this.extractVideoId(url);
    if (!videoId) return null;
    const canonicalUrl = this.canonicalUrl(url)!;
    return buildNormalizedResult(url, this.platform, canonicalUrl, canonicalUrl, this.embedUrl(url), videoId);
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

function isKnownVideoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.includes("youtube.com") || host === "youtu.be" || host.includes("facebook.com") || host.includes("vimeo.com");
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
