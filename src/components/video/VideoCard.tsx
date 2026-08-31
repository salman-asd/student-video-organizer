"use client";

import Image from "next/image";
import Link from "next/link";
import { Star, Clock, CheckCircle2, GripVertical, ExternalLink, Play, Flag, Plus, Trash2, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { detectVideoPlatform, getExternalWatchAction } from "@/lib/video-platforms";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { cn, formatDuration } from "@/lib/utils";
import type { PriorityLevel, VideoWithState } from "@/types";

const priorityDot: Record<string, string> = {
  high: "bg-priorityHigh",
  medium: "bg-priorityMedium",
  low: "bg-priorityLow",
};

export function VideoCard({
  video, dragHandleProps, className, showActions = false, showSelection = false, selected = false, priority = false,
  onToggleSelect, onToggleFavorite, onToggleWatchLater, onSetPriority, onToggleWatched, onDelete, onAddToPlaylist, onShare,
}: {
  video: VideoWithState; dragHandleProps?: any; className?: string; showActions?: boolean; showSelection?: boolean; selected?: boolean;
  /** Mark true only for the first card above the fold — hints Next/Image to preload it as the LCP element instead of lazy-loading. */
  priority?: boolean;
  onToggleSelect?: () => void; onToggleFavorite?: () => void; onToggleWatchLater?: () => void; onSetPriority?: (p: PriorityLevel) => void; onToggleWatched?: () => void;
  onDelete?: () => void; onAddToPlaylist?: () => void; onShare?: () => void;
}) {
  const watchHref = getVideoWatchHref(video);
  const pct = video.state?.watchedPercentage || 0;
  const completed = video.state?.status === "completed";
  const platform = detectVideoPlatform(video.videoUrl) || video.platform || "generic";
  const watchAction = getExternalWatchAction(video.videoUrl);
  const creator = (video as any).creatorName || "Unknown creator";
  const addedAt = video.createdAt && typeof (video.createdAt as any).toDate === "function"
    ? new Date((video.createdAt as any).toDate()).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Recently";

  return (
    <div className={cn("group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md", selected && "border-primary/70 bg-primary/5", className)}>
      {showSelection && (
        <div className="flex items-center justify-end px-3 pt-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className="h-4 w-4 rounded border-border text-primary"
            aria-label={`Select ${video.title}`}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <Link href={watchHref} className="block">
        <div className="relative aspect-video w-full overflow-hidden bg-secondary">
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            priority={priority}
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
          <span className="absolute inset-x-2 bottom-2 flex justify-between items-end gap-2">
            <Badge variant="secondary" className="bg-black/60 text-white ring-0 hover:bg-black/60">{platform}</Badge>
            {video.durationSeconds ? (
              <span className="rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(video.durationSeconds)}</span>
            ) : null}
          </span>
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
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
          <p className="truncate text-xs text-muted-foreground">{creator}</p>
          <p className="truncate text-[11px] text-muted-foreground">{video.playlistTitle || "User library"} · Added {addedAt}</p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {completed && <Badge variant="success">Completed</Badge>}
          {!completed && pct > 0 && <Badge variant="secondary">{pct}% watched</Badge>}
          {video.state?.priority && (
            <Badge variant={video.state.priority === "high" ? "priorityHigh" : video.state.priority === "medium" ? "priorityMedium" : "priorityLow"}>
              {video.state.priority}
            </Badge>
          )}
        </div>

        <div className="mt-2">
          <a
            href={watchAction.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            onClick={(e) => e.stopPropagation()}
          >
            {watchAction.label}
          </a>
        </div>

        {showActions && (
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); window.location.href = watchHref; }}>
                  <Play className="h-3.5 w-3.5" /> Watch
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Open video</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={completed ? "accent" : "outline"} size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); onToggleWatched?.(); }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {completed ? "Watched" : "Mark"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{completed ? "Mark as not watched" : "Mark as watched"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={video.state?.isFavorite ? "accent" : "outline"} size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); onToggleFavorite?.(); }}>
                  <Star className={cn("h-3.5 w-3.5", video.state?.isFavorite && "fill-current")} /> Favorite
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{video.state?.isFavorite ? "Remove favorite" : "Add favorite"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={video.state?.isWatchLater ? "accent" : "outline"} size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); onToggleWatchLater?.(); }}>
                  <Clock className="h-3.5 w-3.5" /> Later
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{video.state?.isWatchLater ? "Remove from watch later" : "Add to watch later"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <DropdownMenu>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant={video.state?.priority ? "accent" : "outline"} size="sm" className="h-8 w-full px-2.5 sm:w-auto">
                      <Flag className="h-3.5 w-3.5" /> Priority
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Set priority</TooltipContent>
              </DropdownMenu>
            </Tooltip>
            {onAddToPlaylist && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); onAddToPlaylist(); }}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Add to playlist</TooltipContent>
              </Tooltip>
            )}
            {onShare && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-full px-2.5 sm:w-auto" onClick={(e) => { e.preventDefault(); onShare(); }}>
                    <Share2 className="h-3.5 w-3.5" /> Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Share video</TooltipContent>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-full px-2.5 text-destructive sm:w-auto" onClick={(e) => { e.preventDefault(); onDelete(); }}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete video</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
