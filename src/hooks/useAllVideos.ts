"use client";
import * as React from "react";
import { listPlaylists, listVideos } from "@/lib/firestore/playlists";
import { getAllUserVideoStates } from "@/lib/firestore/userVideoState";
import { listAllPersonalVideos } from "@/lib/firestore/personalPlaylists";
import { personalVideoToVideoWithState } from "@/lib/personalVideoAdapter";
import type { Playlist, VideoWithState } from "@/types";

interface AllVideosData {
  loading: boolean;
  playlists: Playlist[];
  videos: VideoWithState[];
  refresh: () => Promise<void>;
}

/**
 * Combines the shared/admin-curated library (useVideoLibrary's source) with
 * the user's own personal-playlist videos into one flat, de-duplicated
 * VideoWithState[]. Use this — instead of useVideoLibrary — for any view
 * that's meant to reflect a user's favorite/watch-later/priority/watched
 * state everywhere it was set, regardless of which tier the video lives in:
 * Watch Later, Favorites, Priority, Continue Watching, and the Dashboard.
 *
 * `library/page.tsx` intentionally keeps using useVideoLibrary alone — it's
 * the shared-library *browse* page, not a personal cross-cutting view.
 */
export function useAllVideos(uid: string | undefined): AllVideosData {
  const [loading, setLoading] = React.useState(true);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [videos, setVideos] = React.useState<VideoWithState[]>([]);

  const load = React.useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const [pls, states, personalVideos] = await Promise.all([
      listPlaylists(false),
      getAllUserVideoStates(uid),
      listAllPersonalVideos(uid),
    ]);
    setPlaylists(pls);

    const sharedVideos: VideoWithState[] = [];
    for (const p of pls) {
      const vids = await listVideos(p.id);
      vids.forEach((v) =>
        sharedVideos.push({ ...v, state: states[v.id] || null, playlistTitle: p.title, source: "shared" })
      );
    }

    const personal = personalVideos.map(personalVideoToVideoWithState);
    setVideos([...sharedVideos, ...personal]);
    setLoading(false);
  }, [uid]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { loading, playlists, videos, refresh: load };
}
