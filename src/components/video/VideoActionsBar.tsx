"use client";

import { ChevronLeft, ChevronRight, Star, Clock, Flag, CheckCircle2, Play, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PriorityLevel } from "@/types";

export function VideoActionsBar({
  isFavorite, isWatchLater, priority, isCompleted,
  hasPrevious, hasNext,
  onPrevious, onNext, onToggleFavorite, onToggleWatchLater, onSetPriority, onToggleWatched,
  onWatch, onAddToPlaylist, onShare, onDelete,
}: {
  isFavorite: boolean; isWatchLater: boolean; priority: PriorityLevel; isCompleted: boolean;
  hasPrevious: boolean; hasNext: boolean;
  onPrevious: () => void; onNext: () => void;
  onToggleFavorite: () => void; onToggleWatchLater: () => void;
  onSetPriority: (p: PriorityLevel) => void; onToggleWatched: () => void;
  onWatch?: () => void; onAddToPlaylist?: () => void; onShare?: () => void; onDelete?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={!hasPrevious} onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </Button>

      {onWatch && (
        <Button variant="outline" size="sm" onClick={onWatch}>
          <Play className="h-4 w-4" /> Watch
        </Button>
      )}

      <Button variant={isWatchLater ? "accent" : "outline"} size="sm" onClick={onToggleWatchLater}>
        <Clock className="h-4 w-4" /> Watch Later
      </Button>

      <Button variant={isFavorite ? "accent" : "outline"} size="sm" onClick={onToggleFavorite}>
        <Star className={cn("h-4 w-4", isFavorite && "fill-current")} /> Favorite
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={priority ? "accent" : "outline"} size="sm">
            <Flag className="h-4 w-4" /> {priority ? `Priority: ${priority}` : "Priority"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => onSetPriority("high")}>🔴 High</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPriority("medium")}>🟡 Medium</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPriority("low")}>🟢 Low</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPriority(null)}>Clear</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {onAddToPlaylist && (
        <Button variant="outline" size="sm" onClick={onAddToPlaylist}>
          <Plus className="h-4 w-4" /> Add to Playlist
        </Button>
      )}

      {onShare && (
        <Button variant="outline" size="sm" onClick={onShare}>
          <Share2 className="h-4 w-4" /> Share
        </Button>
      )}

      {onDelete && (
        <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      )}

      <Button variant={isCompleted ? "accent" : "outline"} size="sm" onClick={onToggleWatched}>
        <CheckCircle2 className="h-4 w-4" /> {isCompleted ? "Watched" : "Mark Watched"}
      </Button>

      <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext} className="ml-auto">
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
