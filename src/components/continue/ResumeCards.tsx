"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown, ExternalLink, Layers, Play, X } from "lucide-react";
import { StackedCover } from "@/components/playlist/StackedCover";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { stackLayers } from "@/lib/playlistSummary";
import { timestampMillis, type ResumeGroup } from "@/lib/resumeGroups";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { cn, formatDuration } from "@/lib/utils";
import type { VideoWithState } from "@/types";

const percentOf = (video: VideoWithState) => Math.max(0, Math.min(100, Math.round(video.state?.watchedPercentage || 0)));
const savedOf = (video: VideoWithState) => Math.max(0, video.state?.currentPositionSeconds || 0);

function agoLabel(ms: number): string | null {
  return ms > 0 ? `${formatDistanceToNowStrict(new Date(ms))} ago` : null;
}

/** "Saved 3:20 · 42%" — the one line of progress context every resume card carries. */
function progressLine(video: VideoWithState): string {
  const saved = savedOf(video);
  return saved > 0 ? `Saved ${formatDuration(saved)} · ${percentOf(video)}%` : `${percentOf(video)}% watched`;
}

function playlistHref(video: VideoWithState): string | null {
  // Only personal playlists have a playlist page; shared items open through their share link.
  return video.source === "personal" && video.playlistId ? `/playlists/${video.playlistId}` : null;
}

/** The single most recent video, big — the fastest possible path back into learning. */
export function ResumeHero({ video }: { video: VideoWithState }) {
  const href = getVideoWatchHref(video);
  const ago = agoLabel(timestampMillis(video.state?.lastWatchedAt));
  const list = playlistHref(video);

  return (
    <section aria-label="Pick up where you left off" className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:grid-cols-[minmax(0,24rem)_1fr]">
      <Link href={href} className="relative block aspect-video md:aspect-auto md:min-h-[13rem]" aria-label={`Resume ${video.title}`}>
        <VideoThumbnail
          src={video.thumbnailUrl}
          alt={video.title}
          videoUrl={video.videoUrl}
          progressPercent={percentOf(video)}
          sizes="(max-width: 768px) 100vw, 384px"
          priority
        />
      </Link>
      <div className="flex flex-col justify-center gap-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Pick up where you left off</p>
        <div className="space-y-1">
          <h2 className="line-clamp-2 font-display text-xl font-semibold leading-snug">{video.title}</h2>
          <p className="text-sm text-muted-foreground">
            {video.playlistTitle || "Library"}{ago ? ` · watched ${ago}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">{progressLine(video)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="lg" className="gap-2">
            <Link href={href}><Play className="h-4 w-4" aria-hidden /> Resume</Link>
          </Button>
          {list && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href={list}><ExternalLink className="h-3.5 w-3.5" aria-hidden /> Open playlist</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One playlist = one stacked card. Same visual language as the Playlists page card, but the cover
 * is the video you'd resume and the bar is THAT video's progress.
 *
 * The title is a "stretched link" (whole card resumes the latest video) so the Continue / View-all
 * buttons can sit above it without nesting interactive elements inside an <a>.
 */
export function ResumeGroupCard({
  group, open, onToggle, priority,
}: {
  group: ResumeGroup<VideoWithState>;
  open: boolean;
  onToggle: () => void;
  priority?: boolean;
}) {
  const latest = group.latest;
  const href = getVideoWatchHref(latest);
  const count = group.videos.length;
  const ago = agoLabel(group.lastWatchedMs);
  const list = playlistHref(latest);

  return (
    <div className="group relative flex h-full flex-col gap-3">
      <StackedCover
        layers={stackLayers(count)}
        src={latest.thumbnailUrl}
        videoUrl={latest.videoUrl}
        alt={`${group.title} — ${latest.title}`}
        progressPercent={percentOf(latest)}
        priority={priority}
        chip={<><Layers className="h-3 w-3" aria-hidden />{count} in progress</>}
      >
        {list && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={list}
                aria-label={`Open playlist ${group.title}`}
                className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">Open playlist</TooltipContent>
          </Tooltip>
        )}
      </StackedCover>

      <div className="flex flex-1 flex-col gap-1 px-1">
        <h3 className="line-clamp-2 font-medium leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {group.title}
          </Link>
        </h3>
        <p className="line-clamp-1 text-xs text-muted-foreground">Next: {latest.title}</p>
        <p className="text-xs text-muted-foreground">{progressLine(latest)}{ago ? ` · ${ago}` : ""}</p>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <Button asChild size="sm" className="relative z-10 gap-1.5">
            <Link href={href}><Play className="h-3.5 w-3.5" aria-hidden /> Continue</Link>
          </Button>
          {count > 1 && (
            <Button
              type="button"
              size="sm"
              variant={open ? "secondary" : "ghost"}
              className="relative z-10 gap-1"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls="resume-group-panel"
            >
              {open ? "Hide" : `View all ${count}`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A single video inside an opened group. */
export function ResumeVideoCard({ video }: { video: VideoWithState }) {
  const href = getVideoWatchHref(video);
  return (
    <div className="group relative flex flex-col gap-2 rounded-xl border border-border bg-card p-2 transition-shadow hover:shadow-md">
      <div className="relative aspect-video overflow-hidden rounded-lg">
        <VideoThumbnail
          src={video.thumbnailUrl}
          alt={video.title}
          videoUrl={video.videoUrl}
          progressPercent={percentOf(video)}
          sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
        >
          {video.durationSeconds ? (
            <span className="absolute bottom-3 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              {formatDuration(video.durationSeconds)}
            </span>
          ) : null}
        </VideoThumbnail>
      </div>
      <div className="space-y-0.5 px-0.5">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug">
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
            {video.title}
          </Link>
        </h4>
        <p className="text-xs text-muted-foreground">{progressLine(video)}</p>
      </div>
    </div>
  );
}

/** The opened group: a tidy wrapped grid under the card grid (never a second layout mode to learn). */
export function ResumeGroupPanel({ group, onClose }: { group: ResumeGroup<VideoWithState>; onClose: () => void }) {
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    ref.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }, [group.key]);

  return (
    <section ref={ref} id="resume-group-panel" aria-label={`${group.title} videos in progress`} className="scroll-mt-20 space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">
          {group.title} <span className="text-sm font-normal text-muted-foreground">· {group.videos.length} in progress</span>
        </h2>
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden /> Close
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {group.videos.map((video) => <ResumeVideoCard key={video.id} video={video} />)}
      </div>
    </section>
  );
}
