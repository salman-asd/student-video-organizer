"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, Clock, CheckCircle2, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatDuration } from "@/lib/utils";
import type { VideoWithState } from "@/types";

const priorityDot: Record<string, string> = {
  high: "bg-priorityHigh",
  medium: "bg-priorityMedium",
  low: "bg-priorityLow",
};

export function VideoCard({
  video, dragHandleProps, className,
}: { video: VideoWithState; dragHandleProps?: any; className?: string }) {
  const pct = video.state?.watchedPercentage || 0;
  const completed = video.state?.status === "completed";

  return (
    <Link
      href={`/video/${video.id}?playlist=${video.playlistId}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md",
        className
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-secondary">
        <Image
          src={video.thumbnailUrl}
          alt={video.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            className="absolute left-2 top-2 cursor-grab rounded bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="absolute right-2 top-2 flex gap-1">
          {video.state?.isFavorite && (
            <span className="rounded-full bg-black/60 p-1"><Star className="h-3.5 w-3.5 fill-accent text-accent" /></span>
          )}
          {video.state?.isWatchLater && (
            <span className="rounded-full bg-black/60 p-1"><Clock className="h-3.5 w-3.5 text-white" /></span>
          )}
        </div>
        {video.state?.priority && (
          <span className={cn("absolute left-2 bottom-2 h-2.5 w-2.5 rounded-full ring-2 ring-white/80", priorityDot[video.state.priority])} />
        )}
        {video.durationSeconds ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
            {formatDuration(video.durationSeconds)}
          </span>
        ) : null}
        {completed && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <CheckCircle2 className="h-8 w-8 text-white" />
          </span>
        )}
        {pct > 0 && (
          <div className="absolute inset-x-0 bottom-0">
            <Progress value={pct} className="h-1 rounded-none bg-black/30" />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
        <p className="truncate text-xs text-muted-foreground">{video.playlistTitle}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-1">
          {completed && <Badge variant="success">Completed</Badge>}
          {!completed && pct > 0 && <Badge variant="secondary">{pct}% watched</Badge>}
          {video.state?.priority && (
            <Badge variant={video.state.priority === "high" ? "priorityHigh" : video.state.priority === "medium" ? "priorityMedium" : "priorityLow"}>
              {video.state.priority}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}
