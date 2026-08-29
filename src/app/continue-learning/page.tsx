"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { isResumeEligible } from "@/lib/watchProgress";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { formatDuration } from "@/lib/utils";
import type { VideoWithState } from "@/types";

export default function ContinueLearningPage() {
  return (
    <RequireAuth>
      <ContinueLearningContent />
    </RequireAuth>
  );
}

function ContinueLearningContent() {
  const { user } = useAuth();
  const { loading, videos } = useAllVideos(user?.uid);

  const continueWatching = React.useMemo(
    () => videos.filter((v) => !!v.state && isResumeEligible(v.state)).sort((a, b) => {
      const bTime = b.state?.lastWatchedAt ? tsMillis(b.state.lastWatchedAt) : 0;
      const aTime = a.state?.lastWatchedAt ? tsMillis(a.state.lastWatchedAt) : 0;
      return bTime - aTime || (b.state?.watchedPercentage || 0) - (a.state?.watchedPercentage || 0);
    }),
    [videos]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Continue Watching</h1>
          <p className="text-sm text-muted-foreground">Resume videos with real progress and pick up from where you left off.</p>
        </div>

        {!loading && continueWatching.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Start a video to build your resume queue.
          </div>
        )}

        {continueWatching.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {continueWatching.map((video, index) => (
              <ContinueWatchingCard key={video.id} video={video} priority={index === 0} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ContinueWatchingCard({ video, priority = false }: { video: VideoWithState; priority?: boolean }) {
  const progress = Math.max(0, Math.min(100, video.state?.watchedPercentage || 0));
  const savedSeconds = Math.max(0, video.state?.currentPositionSeconds || 0);
  const resumeUrl = getVideoWatchHref(video);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Link href={resumeUrl} className="block">
        <div className="relative aspect-video w-full overflow-hidden bg-secondary">
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover"
            priority={priority}
          />
          <div className="absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">{video.playlistTitle || "Library"}</span>
            {video.durationSeconds ? <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(video.durationSeconds)}</span> : null}
          </div>
        </div>
      </Link>

      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
          <p className="text-[11px] text-muted-foreground">
            {video.state?.lastWatchedAt ? `Last watched ${formatTimestamp(video.state.lastWatchedAt)}` : "Started recently"}
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{savedSeconds > 0 ? `Saved ${formatDuration(savedSeconds)}` : "Started"}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Button asChild className="w-full">
          <Link href={resumeUrl}>Continue</Link>
        </Button>
      </div>
    </div>
  );
}

function tsMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function formatTimestamp(value: any): string {
  if (!value) return "Recently";
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return "Recently";
}
