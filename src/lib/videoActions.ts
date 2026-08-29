import {
  setWatchedStatus as setSharedWatchedStatus,
  toggleFavorite as toggleSharedFavorite,
  toggleWatchLater as toggleSharedWatchLater,
  setPriority as setSharedPriority,
  reorderPersonalList as reorderSharedList,
} from "@/lib/firestore/userVideoState";
import {
  setPersonalVideoWatched,
  togglePersonalVideoFavorite,
  togglePersonalVideoWatchLater,
  setPersonalVideoPriority,
  reorderPersonalVideoList,
} from "@/lib/firestore/personalPlaylists";
import type { PriorityLevel, VideoWithState } from "@/types";

/**
 * Cross-cutting personal views (Watch Later, Favorites, Priority, Continue
 * Watching, Dashboard) render a merge of shared-library and personal-tier
 * videos (see useAllVideos). Both tiers expose the same favorite/watch
 * later/priority/watched concepts, but persist them to different Firestore
 * paths — these helpers route each write to the right one based on the
 * video's `source` tag so the calling page doesn't need to know or care
 * which tier a given video came from.
 */

export async function setWatchedAny(uid: string, video: VideoWithState, watched: boolean) {
  if (video.source === "personal") {
    return setPersonalVideoWatched(uid, video.playlistId, video.id, watched);
  }
  return setSharedWatchedStatus(uid, video.id, video.playlistId, watched);
}

export async function toggleFavoriteAny(uid: string, video: VideoWithState, value: boolean) {
  if (video.source === "personal") {
    return togglePersonalVideoFavorite(uid, video.playlistId, video.id, value);
  }
  return toggleSharedFavorite(uid, video.id, video.playlistId, value);
}

export async function toggleWatchLaterAny(uid: string, video: VideoWithState, value: boolean) {
  if (video.source === "personal") {
    return togglePersonalVideoWatchLater(uid, video.playlistId, video.id, value);
  }
  return toggleSharedWatchLater(uid, video.id, video.playlistId, value);
}

export async function setPriorityAny(uid: string, video: VideoWithState, priority: PriorityLevel) {
  if (video.source === "personal") {
    return setPersonalVideoPriority(uid, video.playlistId, video.id, priority);
  }
  return setSharedPriority(uid, video.id, video.playlistId, priority);
}

/** Persists a drag-reordered Watch Later / Priority list that may mix
 *  shared-library and personal-tier videos, splitting the batch write
 *  across each tier's own storage. Both writes use the item's index in the
 *  *overall* merged list (not re-numbered per tier) so ordering stays
 *  correctly interleaved when the two tiers are sorted back together by
 *  this same field. */
export async function reorderMixedList(
  uid: string,
  orderedVideos: VideoWithState[],
  field: "watchLaterOrder" | "priorityOrder"
) {
  const shared = orderedVideos
    .map((v, index) => ({ v, index }))
    .filter(({ v }) => v.source !== "personal");
  const personal = orderedVideos
    .map((v, index) => ({ v, index }))
    .filter(({ v }) => v.source === "personal");

  await Promise.all([
    shared.length
      ? reorderSharedList(uid, shared.map(({ v }) => v.id), field, shared.map(({ index }) => index))
      : Promise.resolve(),
    personal.length
      ? reorderPersonalVideoList(
          uid,
          personal.map(({ v }) => ({ id: v.id, playlistId: v.playlistId })),
          field,
          personal.map(({ index }) => index)
        )
      : Promise.resolve(),
  ]);
}
