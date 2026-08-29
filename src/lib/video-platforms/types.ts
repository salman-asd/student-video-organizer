import type { VideoPlatform } from "@/types";

export interface NormalizedVideoUrl {
  platform: VideoPlatform;
  inputUrl: string;
  normalizedUrl: string;
  canonicalUrl: string;
  originalWatchUrl: string | null;
  embedUrl: string | null;
  externalVideoId: string | null;
  isValid: boolean;
  isShortened: boolean;
}

export interface VideoUrlProvider {
  platform: VideoPlatform;
  detect(url: string): boolean;
  normalize(url: string): NormalizedVideoUrl | null;
  extractVideoId(url: string): string | null;
  canonicalUrl(url: string): string | null;
  originalWatchUrl(url: string): string | null;
  embedUrl(url: string): string | null;
}

function isLocalOrPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;

  const maybeIpv4 = host.split(":")[0];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(maybeIpv4)) {
    const parts = maybeIpv4.split(".").map(Number);
    const isPrivateOrLoopback =
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 127) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 0);
    return isPrivateOrLoopback;
  }

  return host === "127.0.0.1" || host === "::1" || host.startsWith("[::1]");
}

export function parseVideoUrl(rawUrl: string): URL | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.hostname.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }

    if (!host || host === "localhost" || host.endsWith(".localhost") || isLocalOrPrivateHostname(host)) {
      return null;
    }

    // Accept protocol-less URLs that look like real web hosts, but reject
    // obvious non-URL strings like "not-a-url".
    if (!/^https?:\/\//i.test(trimmed) && !host.includes(".")) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function isShortenedProviderUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return hostname === "youtu.be" || hostname === "fb.watch" || hostname === "vimeo.com" && url.pathname.length > 1 && !url.pathname.includes("/video/");
}
