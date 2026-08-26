import { Skeleton } from "@/components/ui/skeleton";
import { VideoCard } from "./VideoCard";
import type { VideoWithState } from "@/types";
import { Inbox } from "lucide-react";

export function VideoGrid({
  videos, loading, emptyTitle = "Nothing here yet", emptyHint = "Try adjusting your filters.",
}: { videos: VideoWithState[]; loading?: boolean; emptyTitle?: string; emptyHint?: string }) {
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
      {videos.map((v) => <VideoCard key={v.id} video={v} />)}
    </div>
  );
}
