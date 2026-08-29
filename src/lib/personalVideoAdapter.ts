import type { PersonalVideo, VideoWithState } from "@/types";

/**
 * Converts a PersonalVideo (personal playlists tier — favorite/watch-later/
 * priority/watched all live directly on the video doc) into the same
 * VideoWithState shape the shared library produces (Video + separate
 * UserVideoState). This lets every existing consumer component
 * (VideoCard, VideoGrid, VideoListRow, SortableList, ContinueWatchingCard)
 * render either tier without modification — only the data-fetching hooks
 * and the write-handlers in each page need to know the two tiers exist.
 */
export function personalVideoToVideoWithState(pv: PersonalVideo & { playlistTitle: string }): VideoWithState {
  return {
    id: pv.id,
    playlistId: pv.playlistId,
    title: pv.title,
    videoUrl: pv.videoUrl,
    youtubeVideoId: pv.youtubeVideoId,
    thumbnailUrl: pv.thumbnailUrl,
    durationSeconds: pv.durationSeconds,
    creatorName: pv.creator,
    platform: pv.platform,
    description: pv.description || undefined,
    order: pv.order,
    createdAt: pv.createdAt,
    updatedAt: pv.updatedAt,
    playlistTitle: pv.playlistTitle,
    source: "personal",
    state: {
      videoId: pv.id,
      playlistId: pv.playlistId,
      status: pv.status,
      watchedPercentage: pv.watchedPercentage,
      currentPositionSeconds: pv.currentPositionSeconds,
      isFavorite: pv.isFavorite,
      isWatchLater: pv.isWatchLater,
      priority: pv.priority,
      watchLaterOrder: pv.watchLaterOrder ?? undefined,
      priorityOrder: pv.priorityOrder ?? undefined,
      lastWatchedAt: pv.lastWatchedAt,
      completedAt: pv.completedAt,
      updatedAt: pv.updatedAt,
    },
  };
}
