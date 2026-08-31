"use client";

import Image from "next/image";
import Link from "next/link";
import {
  GripVertical, CheckCircle2, Circle, Star, Clock, Flag, MoreVertical, Pencil, Trash2, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDuration, cn } from "@/lib/utils";
import { parseLessonPartPage } from "@/lib/lessonPartPageSort";
import type { PersonalVideo, PriorityLevel } from "@/types";

const PRIORITY_DOT: Record<"high" | "medium" | "low", string> = {
  high: "bg-priorityHigh",
  medium: "bg-priorityMedium",
  low: "bg-priorityLow",
};

export function PlaylistVideoRow({
  video, watchHref, selected, dragHandleProps, canDrag, isSorting,
  canMoveUp, canMoveDown, onToggleSelect, onMoveUp, onMoveDown,
  onEdit, onRemove, onToggleFavorite, onToggleWatchLater, onSetPriority, onToggleWatched,
}: {
  video: PersonalVideo;
  watchHref: string;
  selected: boolean;
  dragHandleProps?: any;
  canDrag: boolean;
  isSorting: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onToggleFavorite: () => void;
  onToggleWatchLater: () => void;
  onSetPriority: (p: PriorityLevel) => void;
  onToggleWatched: () => void;
}) {
  const { lesson, part, page } = parseLessonPartPage(video.title);
  const lessonLabel = [
    lesson !== null ? `Lesson ${lesson}` : null,
    part !== null ? `Part ${part}` : null,
    page !== null ? `Page ${page}` : null,
  ].filter(Boolean).join(" · ");
  const isWatched = video.status === "completed";

  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 transition-colors sm:gap-3 sm:px-2.5",
        selected && "border-primary/70 bg-primary/5"
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggleSelect}
        aria-label={`Select ${video.title}`}
        className="shrink-0"
      />

      <span
        {...(canDrag ? dragHandleProps : {})}
        className={cn(
          "hidden shrink-0 p-1 text-muted-foreground sm:block",
          canDrag ? "cursor-grab" : "pointer-events-none opacity-30"
        )}
        aria-hidden={!canDrag}
      >
        <GripVertical className="h-4 w-4" />
      </span>

      <Link href={watchHref} className="relative h-11 w-[72px] shrink-0 overflow-hidden rounded-md bg-secondary sm:h-12 sm:w-20">
        {video.thumbnailUrl && <Image src={video.thumbnailUrl} alt={video.title} fill className="object-cover" sizes="80px" />}
        {isWatched && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40">
            <CheckCircle2 className="h-4 w-4 text-white" />
          </span>
        )}
      </Link>

      <Link href={watchHref} className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", isWatched ? "text-muted-foreground" : "font-medium")}>{video.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {lessonLabel && <span className="font-medium text-foreground/70">{lessonLabel}</span>}
          {video.durationSeconds ? <span>{formatDuration(video.durationSeconds)}</span> : null}
          {!isWatched && video.watchedPercentage > 0 && <span>{video.watchedPercentage}% watched</span>}
        </div>
      </Link>

      {/* Status indicators — compact icon row, hidden on the smallest
          screens where space is tightest; the overflow menu still exposes
          every action regardless of width. */}
      <div className="hidden shrink-0 items-center gap-0.5 sm:flex">
        {video.priority && (
          <span
            className={cn("h-2 w-2 rounded-full", PRIORITY_DOT[video.priority])}
            title={`${video.priority} priority`}
            aria-hidden
          />
        )}
        <Button
          variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleFavorite}
          aria-label={video.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star className={cn("h-4 w-4", video.isFavorite && "fill-accent text-accent")} />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleWatchLater}
          aria-label={video.isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
        >
          <Clock className={cn("h-4 w-4", video.isWatchLater && "text-accent")} />
        </Button>
        <Button
          variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleWatched}
          aria-label={isWatched ? "Mark unwatched" : "Mark watched"}
        >
          {isWatched ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4" />}
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="More actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Favorite/Watch Later/Watched repeated here for narrow screens
              where the inline icon row above is hidden. */}
          <DropdownMenuItem className="sm:hidden" onClick={onToggleFavorite}>
            {video.isFavorite ? "Remove favorite" : "Add favorite"}
          </DropdownMenuItem>
          <DropdownMenuItem className="sm:hidden" onClick={onToggleWatchLater}>
            {video.isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
          </DropdownMenuItem>
          <DropdownMenuItem className="sm:hidden" onClick={onToggleWatched}>
            {isWatched ? "Mark unwatched" : "Mark watched"}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="sm:hidden" />
          <DropdownMenuItem onClick={() => onSetPriority("high")}><Flag className="h-3.5 w-3.5 text-priorityHigh" /> High priority</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPriority("medium")}><Flag className="h-3.5 w-3.5 text-priorityMedium" /> Medium priority</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPriority("low")}><Flag className="h-3.5 w-3.5 text-priorityLow" /> Low priority</DropdownMenuItem>
          {video.priority && <DropdownMenuItem onClick={() => onSetPriority(null)}>Clear priority</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onMoveUp} disabled={!canMoveUp || isSorting}><ChevronUp className="h-3.5 w-3.5" /> Move up</DropdownMenuItem>
          <DropdownMenuItem onClick={onMoveDown} disabled={!canMoveDown || isSorting}><ChevronDown className="h-3.5 w-3.5" /> Move down</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Remove</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
