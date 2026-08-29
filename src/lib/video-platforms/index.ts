import type { VideoPlatform } from "@/types";
import { detectVideoProvider } from "./providers";
import type { NormalizedVideoUrl } from "./types";

export * from "./providers";
export * from "./types";

export function detectVideoPlatform(url: string): VideoPlatform | null {
  const provider = detectVideoProvider(url);
  return provider ? provider.platform : null;
}

export function validateVideoUrl(url: string): boolean {
  return normalizeVideoUrl(url) !== null;
}

export function normalizeVideoUrl(url: string): NormalizedVideoUrl | null {
  const provider = detectVideoProvider(url);
  if (!provider) return null;
  return provider.normalize(url);
}

export function extractExternalVideoId(url: string): string | null {
  const provider = detectVideoProvider(url);
  if (!provider) return null;
  return provider.extractVideoId(url);
}

export function generateCanonicalUrl(url: string): string | null {
  const provider = detectVideoProvider(url);
  if (!provider) return null;
  return provider.canonicalUrl(url);
}

export function generateOriginalWatchUrl(url: string): string | null {
  const provider = detectVideoProvider(url);
  if (!provider) return null;
  return provider.originalWatchUrl(url);
}

export function generateEmbedUrl(url: string): string | null {
  const provider = detectVideoProvider(url);
  if (!provider) return null;
  return provider.embedUrl(url);
}

export function getExternalWatchAction(url: string): { href: string; label: string } {
  const normalized = normalizeVideoUrl(url);
  const canonicalUrl = normalized?.canonicalUrl || url;
  const platform = detectVideoPlatform(url) || "generic";

  const labelByPlatform: Record<string, string> = {
    youtube: "Watch on YouTube",
    "youtube-shorts": "Watch on YouTube",
    facebook: "Watch on Facebook",
    vimeo: "Watch Original Video",
    generic: "Watch Original Video",
  };

  return {
    href: canonicalUrl,
    label: labelByPlatform[platform] || "Watch Original Video",
  };
}
