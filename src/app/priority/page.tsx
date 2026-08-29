"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { SortableList } from "@/components/dnd/SortableList";
import { VideoListRow } from "@/components/video/VideoListRow";
import { Skeleton } from "@/components/ui/skeleton";
import { setPriorityAny, setWatchedAny, reorderMixedList } from "@/lib/videoActions";
import type { VideoWithState } from "@/types";
import { toast } from "sonner";

const LEVELS: { key: "high" | "medium" | "low"; label: string; emoji: string }[] = [
  { key: "high", label: "High Priority", emoji: "🔴" },
  { key: "medium", label: "Medium Priority", emoji: "🟡" },
  { key: "low", label: "Low Priority", emoji: "🟢" },
];

export default function PriorityPage() {
  return (
    <RequireAuth>
      <PriorityContent />
    </RequireAuth>
  );
}

function PriorityContent() {
  const { user } = useAuth();
  const { loading, videos, refresh } = useAllVideos(user?.uid);
  const [groups, setGroups] = React.useState<Record<string, VideoWithState[]>>({ high: [], medium: [], low: [] });

  React.useEffect(() => {
    const g: Record<string, VideoWithState[]> = { high: [], medium: [], low: [] };
    videos.forEach((v) => {
      if (v.state?.priority) g[v.state.priority].push(v);
    });
    Object.keys(g).forEach((k) => g[k].sort((a, b) => (a.state?.priorityOrder || 0) - (b.state?.priorityOrder || 0)));
    setGroups(g);
  }, [videos]);

  if (!user) return null;

  async function handleReorder(level: string, newOrder: VideoWithState[]) {
    setGroups((g) => ({ ...g, [level]: newOrder }));
    await reorderMixedList(user!.uid, newOrder, "priorityOrder");
  }

  async function handleChangeLevel(v: VideoWithState, p: "high" | "medium" | "low" | null) {
    await setPriorityAny(user!.uid, v, p);
    toast.success(p ? `Moved to ${p} priority` : "Priority removed");
    refresh();
  }

  async function handleMarkWatched(v: VideoWithState) {
    await setWatchedAny(user!.uid, v, v.state?.status !== "completed");
    refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Priority</h1>
          <p className="text-sm text-muted-foreground">Videos you&apos;ve marked important, ordered High → Medium → Low.</p>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full rounded-lg" />)}</div>
        ) : (
          LEVELS.map(({ key, label, emoji }) => (
            <section key={key} className="space-y-2">
              <h2 className="font-display text-base font-semibold">{emoji} {label} <span className="text-sm font-normal text-muted-foreground">({groups[key]?.length || 0})</span></h2>
              {(!groups[key] || groups[key].length === 0) ? (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">No videos here.</p>
              ) : (
                <SortableList
                  items={groups[key]}
                  getId={(v) => v.id}
                  onReorder={(n) => handleReorder(key, n)}
                  className="space-y-2"
                  renderItem={(v, dragHandleProps) => (
                    <VideoListRow
                      video={v}
                      dragHandleProps={dragHandleProps}
                      onMarkWatched={() => handleMarkWatched(v)}
                      onSetPriority={(p) => handleChangeLevel(v, p)}
                    />
                  )}
                />
              )}
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
