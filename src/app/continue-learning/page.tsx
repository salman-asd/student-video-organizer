"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { VideoGrid } from "@/components/video/VideoGrid";

export default function ContinueLearningPage() {
  return (
    <RequireAuth>
      <ContinueLearningContent />
    </RequireAuth>
  );
}

function ContinueLearningContent() {
  const { user } = useAuth();
  const { loading, videos } = useVideoLibrary(user?.uid);

  const inProgress = videos
    .filter((v) => v.state?.status === "in_progress")
    .sort((a, b) => tsMillis(b.state?.lastWatchedAt) - tsMillis(a.state?.lastWatchedAt));

  // "Next in active playlists": the first not-started video that comes right
  // after the most recently watched video within the same playlist.
  const nextUp = React.useMemo(() => {
    const byPlaylist = new Map<string, typeof videos>();
    videos.forEach((v) => {
      if (!byPlaylist.has(v.playlistId)) byPlaylist.set(v.playlistId, []);
      byPlaylist.get(v.playlistId)!.push(v);
    });
    const results: typeof videos = [];
    byPlaylist.forEach((list) => {
      const sorted = [...list].sort((a, b) => a.order - b.order);
      const hasActivity = sorted.some((v) => v.state?.status && v.state.status !== "not_started");
      if (!hasActivity) return;
      const next = sorted.find((v) => !v.state || v.state.status === "not_started");
      if (next) results.push(next);
    });
    return results;
  }, [videos]);

  const recentlyWatched = videos
    .filter((v) => v.state?.status === "completed")
    .sort((a, b) => tsMillis(b.state?.completedAt) - tsMillis(a.state?.completedAt))
    .slice(0, 8);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Continue Learning</h1>
          <p className="text-sm text-muted-foreground">Picks up where you left off, automatically.</p>
        </div>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">In Progress</h2>
          <VideoGrid videos={inProgress} loading={loading} emptyTitle="Nothing in progress" emptyHint="Start a video from the library to see it here." />
        </section>

        {nextUp.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Next Up</h2>
            <VideoGrid videos={nextUp} loading={loading} />
          </section>
        )}

        {recentlyWatched.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-semibold">Recently Completed</h2>
            <VideoGrid videos={recentlyWatched} loading={loading} />
          </section>
        )}
      </div>
    </AppShell>
  );
}

function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return 0;
}
