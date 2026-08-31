"use client";

import Image from "next/image";
import Link from "next/link";
import { GripVertical, CheckCircle2, X, Star, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDuration } from "@/lib/utils";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import type { VideoWithState } from "@/types";

export function VideoListRow({
  video, dragHandleProps, onMarkWatched, onRemove, onSetPriority, onToggleFavorite,
}: {
  video: VideoWithState;
  dragHandleProps?: any;
  onMarkWatched?: () => void;
  onRemove?: () => void;
  onSetPriority?: (p: "high" | "medium" | "low" | null) => void;
  onToggleFavorite?: () => void;
}) {
  const watchHref = getVideoWatchHref(video);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
      {dragHandleProps && (
        <span {...dragHandleProps} className="cursor-grab p-1 text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </span>
      )}
      <Link href={watchHref} className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
        <Image src={video.thumbnailUrl} alt={video.title} fill className="object-cover" sizes="96px" />
      </Link>
      <Link href={watchHref} className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{video.title}</p>
        <p className="truncate text-xs text-muted-foreground">{video.playlistTitle} · {formatDuration(video.durationSeconds)}</p>
      </Link>

      {video.state?.priority && (
        <Badge variant={video.state.priority === "high" ? "priorityHigh" : video.state.priority === "medium" ? "priorityMedium" : "priorityLow"} className="hidden sm:flex">
          {video.state.priority === "high" ? "🔴" : video.state.priority === "medium" ? "🟡" : "🟢"} {video.state.priority}
        </Badge>
      )}

      <div className="flex items-center gap-1">
        {onToggleFavorite && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onToggleFavorite} aria-label="Toggle favorite">
                <Star className={video.state?.isFavorite ? "h-4 w-4 fill-accent text-accent" : "h-4 w-4"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{video.state?.isFavorite ? "Remove favorite" : "Add favorite"}</TooltipContent>
          </Tooltip>
        )}
        {onSetPriority && (
          <Tooltip>
            <DropdownMenu>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Set priority"><Flag className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Set priority</TooltipContent>
            </DropdownMenu>
          </Tooltip>
        )}
        {onMarkWatched && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onMarkWatched} aria-label="Mark watched">
                <CheckCircle2 className={video.state?.status === "completed" ? "h-4 w-4 text-success" : "h-4 w-4"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{video.state?.status === "completed" ? "Mark not watched" : "Mark watched"}</TooltipContent>
          </Tooltip>
        )}
        {onRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove">
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Remove video</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
