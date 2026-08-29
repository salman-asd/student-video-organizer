import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "./VideoCard";
import type { PriorityLevel, VideoWithState } from "@/types";
import { Inbox } from "lucide-react";

export function VideoGrid({
  videos, loading, emptyTitle = "Nothing here yet", emptyHint = "Try adjusting your filters.",
  showActions = false, showSelection = false, selectedIds = [], onToggleSelect,
  onToggleFavorite, onToggleWatchLater, onSetPriority, onToggleWatched, onDelete, onAddToPlaylist, onShare,
}: {
  videos: VideoWithState[]; loading?: boolean; emptyTitle?: string; emptyHint?: string; showActions?: boolean; showSelection?: boolean;
  selectedIds?: string[]; onToggleSelect?: (videoId: string) => void;
  onToggleFavorite?: (video: VideoWithState) => void; onToggleWatchLater?: (video: VideoWithState) => void;
  onSetPriority?: (video: VideoWithState, p: PriorityLevel) => void; onToggleWatched?: (video: VideoWithState) => void;
  onDelete?: (video: VideoWithState) => void; onAddToPlaylist?: (video: VideoWithState) => void; onShare?: (video: VideoWithState) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ))}
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">{emptyTitle}</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((v, index) => (
        <VideoCard
          key={v.id}
          video={v}
          priority={index === 0}
          showActions={showActions}
          showSelection={showSelection}
          selected={showSelection ? selectedIds.includes(v.id) : false}
          onToggleSelect={onToggleSelect ? () => onToggleSelect(v.id) : undefined}
          onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(v) : undefined}
          onToggleWatchLater={onToggleWatchLater ? () => onToggleWatchLater(v) : undefined}
          onSetPriority={onSetPriority ? (p) => onSetPriority(v, p) : undefined}
          onToggleWatched={onToggleWatched ? () => onToggleWatched(v) : undefined}
          onDelete={onDelete ? () => onDelete(v) : undefined}
          onAddToPlaylist={onAddToPlaylist ? () => onAddToPlaylist(v) : undefined}
          onShare={onShare ? () => onShare(v) : undefined}
        />
      ))}
    </div>
  );
}
