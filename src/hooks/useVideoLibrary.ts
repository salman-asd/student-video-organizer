"use client";
import * as React from "react";
import { listPlaylists, listVideos } from "@/lib/firestore/playlists";
import { getAllUserVideoStates } from "@/lib/firestore/userVideoState";
import type { Playlist, Video, VideoWithState } from "@/types";

interface LibraryData {
  loading: boolean;
  playlists: Playlist[];
  videos: VideoWithState[];
  refresh: () => Promise<void>;
}

/**
 * Loads the full shared library once (playlists + their videos) plus the
 * current user's personal state map in a single extra read, then combines
 * them client-side. This intentionally avoids per-video real-time listeners
 * (see README > Firestore free-tier optimization) — data is fetched on
 * mount / explicit refresh rather than subscribed to continuously.
 */
export function useVideoLibrary(uid: string | undefined): LibraryData {
  const [loading, setLoading] = React.useState(true);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [videos, setVideos] = React.useState<VideoWithState[]>([]);

  const load = React.useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    const [pls, states] = await Promise.all([listPlaylists(false), getAllUserVideoStates(uid)]);
    setPlaylists(pls);
    const allVideos: VideoWithState[] = [];
    // Small student group / small library assumption: fetching each
    // playlist's videos is fine at this scale and keeps documents small
    // (one doc per video) rather than one giant array field.
    for (const p of pls) {
      const vids = await listVideos(p.id);
      vids.forEach((v) => allVideos.push({ ...v, state: states[v.id] || null, playlistTitle: p.title }));
    }
    setVideos(allVideos);
    setLoading(false);
  }, [uid]);

  React.useEffect(() => {
    load();
  }, [load]);

  return { loading, playlists, videos, refresh: load };
}
