"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { VideoGrid } from "@/components/video/VideoGrid";
import { toggleFavoriteAny, toggleWatchLaterAny, setPriorityAny, setWatchedAny } from "@/lib/videoActions";
import type { PriorityLevel, VideoWithState } from "@/types";
import { toast } from "sonner";

export default function FavoritesPage() {
  return (
    <RequireAuth>
      <FavoritesContent />
    </RequireAuth>
  );
}

function FavoritesContent() {
  const { user } = useAuth();
  const { loading, videos, refresh } = useAllVideos(user?.uid);
  const favorites = videos.filter((v) => v.state?.isFavorite);

  async function handleUnfavorite(video: VideoWithState) {
    if (!user) return;
    await toggleFavoriteAny(user.uid, video, false);
    toast.success("Removed from favorites");
    refresh();
  }
  async function handleToggleWatchLater(video: VideoWithState) {
    if (!user) return;
    await toggleWatchLaterAny(user.uid, video, !video.state?.isWatchLater);
    refresh();
  }
  async function handleSetPriority(video: VideoWithState, p: PriorityLevel) {
    if (!user) return;
    await setPriorityAny(user.uid, video, p);
    refresh();
  }
  async function handleToggleWatched(video: VideoWithState) {
    if (!user) return;
    await setWatchedAny(user.uid, video, video.state?.status !== "completed");
    refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Favorites</h1>
          <p className="text-sm text-muted-foreground">Videos you&apos;ve marked as favorites — independent of priority or watch later.</p>
        </div>
        <VideoGrid
          videos={favorites}
          loading={loading}
          emptyTitle="No favorites yet"
          emptyHint='Tap the star on any video to add it here.'
          showActions
          onToggleFavorite={handleUnfavorite}
          onToggleWatchLater={handleToggleWatchLater}
          onSetPriority={handleSetPriority}
          onToggleWatched={handleToggleWatched}
        />
      </div>
    </AppShell>
  );
}
