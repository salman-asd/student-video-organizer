import {
  detectVideoProvider,
  extractExternalVideoId,
  generateCanonicalUrl,
  validateVideoUrl,
} from "@/lib/video-platforms";
import type { VideoPlatform } from "@/types";

export interface VideoMetadata {
  title: string;
  description: string | null;
  creator: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  platform: VideoPlatform;
  canonicalUrl: string;
  originalWatchUrl: string;
}

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  description?: string;
  duration?: number;
  upload_date?: string;
  provider_name?: string;
}

const youTubeOEmbedUrl = (url: string) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
const vimeoOEmbedUrl = (url: string) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;

async function fetchOEmbed(url: string, endpoint: string): Promise<OEmbedResponse | null> {
  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as OEmbedResponse;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchVideoMetadata(rawUrl: string): Promise<VideoMetadata | null> {
  const trimmed = rawUrl.trim();
  if (!trimmed || !validateVideoUrl(trimmed)) return null;

  const provider = detectVideoProvider(trimmed);
  if (!provider) return null;

  const canonicalUrl = generateCanonicalUrl(trimmed) ?? trimmed;
  const originalWatchUrl = canonicalUrl;

  if (provider.platform === "youtube" || provider.platform === "youtube-shorts") {
    try {
      const oEmbed = await fetchOEmbed(trimmed, youTubeOEmbedUrl(canonicalUrl));
      if (!oEmbed) return null;

      return {
        title: oEmbed.title || "Untitled video",
        description: oEmbed.description ?? null,
        creator: oEmbed.author_name ?? null,
        thumbnailUrl: oEmbed.thumbnail_url ?? null,
        durationSeconds: null,
        publishedAt: oEmbed.upload_date ?? null,
        platform: provider.platform,
        canonicalUrl,
        originalWatchUrl,
      };
    } catch {
      return null;
    }
  }

  if (provider.platform === "vimeo") {
    try {
      const oEmbed = await fetchOEmbed(trimmed, vimeoOEmbedUrl(canonicalUrl));
      if (!oEmbed) return null;

      return {
        title: oEmbed.title || "Untitled video",
        description: oEmbed.description ?? null,
        creator: oEmbed.author_name ?? null,
        thumbnailUrl: oEmbed.thumbnail_url ?? null,
        durationSeconds: typeof oEmbed.duration === "number" ? Math.max(0, Math.round(oEmbed.duration)) : null,
        publishedAt: oEmbed.upload_date ?? null,
        platform: provider.platform,
        canonicalUrl,
        originalWatchUrl,
      };
    } catch {
      return null;
    }
  }

  // Public metadata endpoints are unavailable for Facebook and generic/other video URLs,
  // so the UI can keep the user in a manual-save flow without bypassing platform restrictions.
  if (provider.platform === "facebook" || provider.platform === "generic") {
    return null;
  }

  return null;
}

export function summarizeVideoMetadata(rawUrl: string, metadata: VideoMetadata | null) {
  const videoId = extractExternalVideoId(rawUrl);
  return {
    title: metadata?.title || "Untitled video",
    thumbnailUrl: metadata?.thumbnailUrl || null,
    platform: detectVideoProvider(rawUrl)?.platform || "generic",
    externalVideoId: videoId,
  };
}
