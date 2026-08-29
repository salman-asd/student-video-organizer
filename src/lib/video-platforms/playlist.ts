import type { VideoPlatform } from "@/types";
import { parseVideoUrl } from "./types";

export interface ExternalPlaylistVideo {
  title: string;
  videoUrl: string;
  youtubeVideoId?: string | null;
  thumbnailUrl: string;
  durationSeconds?: number;
  description?: string | null;
  creator?: string | null;
  publishedAt?: string | null;
  platform: VideoPlatform;
  order: number;
}

export interface ExternalPlaylistPreview {
  provider: "youtube";
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  sourceUrl: string;
  totalVideos: number;
  unavailableCount: number;
  videos: ExternalPlaylistVideo[];
}

export interface ExternalPlaylistProvider {
  provider: "youtube";
  detect(url: string): boolean;
  extractPlaylistId(url: string): string | null;
  fetchPreview(url: string): Promise<ExternalPlaylistPreview>;
}

function youtubePlaylistThumbnailUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return null;
}

export class YouTubePlaylistProvider implements ExternalPlaylistProvider {
  provider: "youtube" = "youtube";

  detect(url: string): boolean {
    const parsed = parseVideoUrl(url);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("youtube.com") && host !== "youtu.be") return false;
    if (parsed.searchParams.get("list")) return true;
    const pathname = parsed.pathname.toLowerCase();
    return pathname.startsWith("/playlist") || pathname.startsWith("/embed/videoseries");
  }

  extractPlaylistId(url: string): string | null {
    const parsed = parseVideoUrl(url);
    if (!parsed) return null;
    const listId = parsed.searchParams.get("list");
    if (listId) return listId;

    const pathname = parsed.pathname;
    const match = pathname.match(/\/playlist\/?$/i) || pathname.match(/\/embed\/videoseries\/?$/i);
    if (match && parsed.searchParams.get("list")) return parsed.searchParams.get("list");
    return null;
  }

  async fetchPreview(url: string): Promise<ExternalPlaylistPreview> {
    const playlistId = this.extractPlaylistId(url);
    if (!playlistId) {
      throw new Error("This does not look like a valid YouTube playlist URL.");
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new Error("The YouTube API key is not configured on the server.");
    }

    const metaUrl = new URL("https://www.googleapis.com/youtube/v3/playlists");
    metaUrl.searchParams.set("part", "snippet,status");
    metaUrl.searchParams.set("id", playlistId);
    metaUrl.searchParams.set("key", apiKey);

    const metaRes = await fetch(metaUrl.toString(), { cache: "no-store" });
    const metaJson = await metaRes.json();
    if (!metaRes.ok) {
      throw new Error(metaJson?.error?.message || "Unable to read playlist metadata.");
    }

    const playlistItem = metaJson.items?.[0];
    if (!playlistItem) {
      throw new Error("This playlist could not be found or is unavailable.");
    }

    if (playlistItem.status?.privacyStatus === "private") {
      throw new Error("This YouTube playlist is private and cannot be imported.");
    }

    let pageToken = "";
    const items: any[] = [];
    do {
      const itemsUrl = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
      itemsUrl.searchParams.set("part", "snippet,status,contentDetails");
      itemsUrl.searchParams.set("maxResults", "50");
      itemsUrl.searchParams.set("playlistId", playlistId);
      itemsUrl.searchParams.set("key", apiKey);
      if (pageToken) itemsUrl.searchParams.set("pageToken", pageToken);

      const res = await fetch(itemsUrl.toString(), { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Unable to read playlist videos.");
      }
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);

    const validVideos: ExternalPlaylistVideo[] = [];
    let unavailableCount = 0;

    items.forEach((item, index) => {
      const title = item?.snippet?.title;
      const videoId = item?.contentDetails?.videoId || item?.snippet?.resourceId?.videoId;
      const status = item?.status?.privacyStatus || "public";

      if (!videoId || status === "private") {
        unavailableCount += 1;
        return;
      }

      if (title === "Deleted video" || title === "Private video") {
        unavailableCount += 1;
        return;
      }

      validVideos.push({
        title: title || "Untitled video",
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        youtubeVideoId: videoId,
        thumbnailUrl:
          youtubePlaylistThumbnailUrl(item?.snippet?.thumbnails?.high?.url) ||
          youtubePlaylistThumbnailUrl(item?.snippet?.thumbnails?.medium?.url) ||
          youtubePlaylistThumbnailUrl(item?.snippet?.thumbnails?.default?.url) ||
          "",
        durationSeconds: undefined,
        description: item?.snippet?.description || null,
        creator: item?.snippet?.videoOwnerChannelTitle || item?.snippet?.channelTitle || null,
        publishedAt: item?.snippet?.publishedAt || item?.contentDetails?.videoPublishedAt || null,
        platform: "youtube",
        order: index,
      });
    });

    return {
      provider: "youtube",
      title: playlistItem.snippet?.title || "Imported playlist",
      description: playlistItem.snippet?.description || "",
      thumbnailUrl: playlistItem.snippet?.thumbnails?.high?.url || playlistItem.snippet?.thumbnails?.medium?.url || null,
      sourceUrl: url,
      totalVideos: validVideos.length,
      unavailableCount,
      videos: validVideos,
    };
  }
}

export const externalPlaylistProviders: ExternalPlaylistProvider[] = [
  new YouTubePlaylistProvider(),
];

export function detectExternalPlaylistProvider(url: string): ExternalPlaylistProvider | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  return externalPlaylistProviders.find((provider) => provider.detect(trimmed)) ?? null;
}

export async function fetchExternalPlaylistPreview(url: string): Promise<ExternalPlaylistPreview> {
  const provider = detectExternalPlaylistProvider(url);
  if (!provider) {
    throw new Error("Unsupported playlist URL. Please paste a supported YouTube playlist link.");
  }
  return provider.fetchPreview(url);
}
