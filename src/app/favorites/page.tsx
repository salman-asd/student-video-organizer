"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { VideoGrid } from "@/components/video/VideoGrid";

export default function FavoritesPage() {
  return (
    <RequireAuth>
      <FavoritesContent />
    </RequireAuth>
  );
}

function FavoritesContent() {
  const { user } = useAuth();
  const { loading, videos } = useVideoLibrary(user?.uid);
  const favorites = videos.filter((v) => v.state?.isFavorite);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Favorites</h1>
          <p className="text-sm text-muted-foreground">Videos you've marked as favorites — independent of priority or watch later.</p>
        </div>
        <VideoGrid
          videos={favorites}
          loading={loading}
          emptyTitle="No favorites yet"
          emptyHint='Tap the star on any video to add it here.'
        />
      </div>
    </AppShell>
  );
}
