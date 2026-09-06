import type { VideoWithState } from "@/types";

/**
 * The shared/admin library and personal-playlist tiers have separate watch
 * pages (`/video/[videoId]` vs `/playlists/[playlistId]/[videoId]`)
 * because they read from different Firestore paths. Now that merged views
 * (Watch Later, Favorites, Priority, Continue Watching, Dashboard) render
 * both tiers side by side with the same card/row components, every link
 * needs to route to the tier-appropriate page instead of assuming shared.
 */
export function getVideoWatchHref(video: Pick<VideoWithState, "id" | "playlistId" | "source" | "shareToken" | "shareEntityType">): string {
  if (video.source === "shared" && video.shareToken && video.shareEntityType) {
    return `/share/${video.shareEntityType}/${video.shareToken}`;
  }
  if (video.source === "personal") {
    return `/playlists/${video.playlistId}/${video.id}`;
  }
  return `/video/${video.id}?playlist=${video.playlistId}`;
}
