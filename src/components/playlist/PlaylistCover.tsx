"use client";

import * as React from "react";
import { ListVideo, Plus } from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { completionPercent, stackLayers } from "@/lib/playlistSummary";
import { formatWatchTime, cn } from "@/lib/utils";
import type { PersonalPlaylist } from "@/types";

/**
 * The "stacked deck" cover used by the Playlists page card and the playlist
 * detail hero, so a playlist looks the same everywhere.
 *
 * - 0 videos → dashed empty state; 1 → single card; 2 → one layer behind; 3+ → two.
 * - The layers are decorative (aria-hidden) and only fan out on hover when the
 *   user hasn't asked for reduced motion.
 * - The picture goes through VideoThumbnail (fallback tile, Facebook no-referrer,
 *   progress bar). Never render <Image> directly here — that is exactly what broke
 *   Facebook thumbnails before.
 */
export function PlaylistCover({
  playlist,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw",
  priority = false,
  showChip = true,
  children,
}: {
  playlist: Pick<PersonalPlaylist, "title" | "videoCount" | "totalDurationSeconds" | "summary">;
  className?: string;
  sizes?: string;
  priority?: boolean;
  showChip?: boolean;
  /** Overlay controls (visibility icon, kebab). Must position themselves absolutely. */
  children?: React.ReactNode;
}) {
  const count = playlist.videoCount || 0;
  const layers = stackLayers(count);
  const summary = playlist.summary;
  const cover = summary?.covers?.[0];
  const percent = completionPercent(summary, count);

  return (
    <div className={cn("group/stack relative pt-3", className)}>
      {layers >= 2 && (
        <span aria-hidden className="absolute inset-x-8 top-0 h-6 rounded-t-xl border border-border bg-muted/60 transition-transform duration-200 motion-safe:group-hover/stack:-translate-y-1" />
      )}
      {layers >= 1 && (
        <span aria-hidden className="absolute inset-x-4 top-1.5 h-6 rounded-t-xl border border-border bg-secondary transition-transform duration-200 motion-safe:group-hover/stack:-translate-y-0.5" />
      )}

      <div
        className={cn(
          "relative z-[1] aspect-video overflow-hidden rounded-xl border bg-card shadow-sm",
          count === 0 ? "border-dashed border-border" : "border-border",
        )}
      >
        {count === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Plus className="h-6 w-6" aria-hidden />
            <span className="text-xs font-medium">Empty — add videos</span>
          </div>
        ) : cover ? (
          <VideoThumbnail
            src={cover}
            alt={`${playlist.title} cover`}
            videoUrl={summary?.coverVideoUrls?.[0]}
            progressPercent={percent}
            completed={percent >= 100}
            sizes={sizes}
            priority={priority}
          />
        ) : (
          // No usable cover yet (summary not computed, or every thumbnail missing/expired):
          // a neutral panel, not the "broken image" tile — nothing is wrong, it's just unset.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted text-muted-foreground">
            <ListVideo className="h-9 w-9 opacity-60" aria-hidden />
          </div>
        )}

        {showChip && count > 0 && (
          <span className="pointer-events-none absolute bottom-3 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <ListVideo className="h-3 w-3" aria-hidden />
            {count} video{count === 1 ? "" : "s"}
            {!!playlist.totalDurationSeconds && <span className="opacity-80">· {formatWatchTime(playlist.totalDurationSeconds)}</span>}
          </span>
        )}

        {children}
      </div>
    </div>
  );
}
