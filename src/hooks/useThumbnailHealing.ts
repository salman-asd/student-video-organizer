"use client";

import * as React from "react";
import type { User } from "firebase/auth";
import { refreshPersonalVideoThumbnail } from "@/lib/firestore/personalPlaylists";
import {
  markAttempted, pickHealTargets, requestFreshThumbnails, wasRecentlyAttempted, type HealCandidate,
} from "@/lib/thumbnailHealing";

export interface HealableVideo extends HealCandidate {
  id: string;
  playlistId: string;
  source?: "personal" | "shared";
}

/**
 * Refreshes expired/missing Facebook thumbnails in the background.
 *
 * - `onHealed(videoUrl, freshUrl)` lets the page patch its own state so the
 *   tile updates immediately.
 * - Personal videos (owned by `user`) are also written back to Firestore so the
 *   fix persists; shared/admin videos are only patched in memory.
 * - Runs at most once per URL per page load (in-memory) and at most once per
 *   cooldown window across visits (localStorage), so a private video whose
 *   scrape always fails cannot cause repeated requests.
 */
export function useThumbnailHealing(
  user: User | null | undefined,
  videos: HealableVideo[],
  onHealed: (videoUrl: string, thumbnailUrl: string) => void,
) {
  const inFlight = React.useRef<Set<string>>(new Set());
  const onHealedRef = React.useRef(onHealed);
  onHealedRef.current = onHealed;

  React.useEffect(() => {
    if (!user || videos.length === 0) return;

    const targets = pickHealTargets(videos, {
      recentlyTried: (url) => inFlight.current.has(url) || wasRecentlyAttempted(url),
    });
    if (targets.length === 0) return;
    targets.forEach((url) => inFlight.current.add(url));

    let cancelled = false;
    void (async () => {
      const idToken = await user.getIdToken();
      const results = await requestFreshThumbnails(idToken, targets);
      targets.forEach((url) => markAttempted(url));
      if (cancelled) return;

      for (const [videoUrl, fresh] of Object.entries(results)) {
        if (!fresh) continue;
        onHealedRef.current(videoUrl, fresh);
        const owned = videos.filter((v) => v.videoUrl === videoUrl && v.source === "personal");
        await Promise.all(
          owned.map((v) => refreshPersonalVideoThumbnail(user.uid, v.playlistId, v.id, fresh).catch(() => {})),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, videos]);
}
