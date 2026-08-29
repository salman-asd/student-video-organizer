"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { SortableList } from "@/components/dnd/SortableList";
import { VideoListRow } from "@/components/video/VideoListRow";
import { Skeleton } from "@/components/ui/skeleton";
import { toggleWatchLaterAny, setWatchedAny, setPriorityAny, reorderMixedList } from "@/lib/videoActions";
import type { VideoWithState } from "@/types";
import { toast } from "sonner";

export default function WatchLaterPage() {
  return (
    <RequireAuth>
      <WatchLaterContent />
    </RequireAuth>
  );
}

function WatchLaterContent() {
  const { user } = useAuth();
  const { loading, videos, refresh } = useAllVideos(user?.uid);
  const [order, setOrder] = React.useState<VideoWithState[]>([]);

  React.useEffect(() => {
    const list = videos
      .filter((v) => v.state?.isWatchLater)
      .sort((a, b) => (a.state?.watchLaterOrder || 0) - (b.state?.watchLaterOrder || 0));
    setOrder(list);
  }, [videos]);

  if (!user) return null;

  async function handleReorder(newOrder: VideoWithState[]) {
    setOrder(newOrder);
    await reorderMixedList(user!.uid, newOrder, "watchLaterOrder");
  }

  async function handleRemove(v: VideoWithState) {
    await toggleWatchLaterAny(user!.uid, v, false);
    toast.success("Removed from Watch Later");
    refresh();
  }

  async function handleMarkWatched(v: VideoWithState) {
    const next = v.state?.status !== "completed";
    await setWatchedAny(user!.uid, v, next);
    toast.success(next ? "Marked watched" : "Marked unwatched");
    refresh();
  }

  async function handlePriority(v: VideoWithState, p: "high" | "medium" | "low" | null) {
    await setPriorityAny(user!.uid, v, p);
    refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Watch Later</h1>
          <p className="text-sm text-muted-foreground">Videos you&apos;ve saved to come back to. Drag to reorder.</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-lg" />)}
          </div>
        ) : order.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            Nothing saved yet — tap &quot;Watch Later&quot; on any video to add it here.
          </p>
        ) : (
          <SortableList
            items={order}
            getId={(v) => v.id}
            onReorder={handleReorder}
            className="space-y-2"
            renderItem={(v, dragHandleProps) => (
              <VideoListRow
                video={v}
                dragHandleProps={dragHandleProps}
                onMarkWatched={() => handleMarkWatched(v)}
                onRemove={() => handleRemove(v)}
                onSetPriority={(p) => handlePriority(v, p)}
              />
            )}
          />
        )}
      </div>
    </AppShell>
  );
}
