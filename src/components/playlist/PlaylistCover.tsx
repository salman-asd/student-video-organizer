"use client";

import * as React from "react";
import { ListVideo } from "lucide-react";
import { StackedCover } from "@/components/playlist/StackedCover";
import { completionPercent, stackLayers } from "@/lib/playlistSummary";
import { formatWatchTime } from "@/lib/utils";
import type { PersonalPlaylist } from "@/types";

/**
 * Playlist flavour of <StackedCover>: cover = first valid thumbnail in the playlist summary,
 * progress bar = how much of the PLAYLIST is watched, chip = "N videos · duration".
 * Used by the Playlists page card and the playlist detail hero.
 */
export function PlaylistCover({
  playlist,
  className,
  sizes,
  priority = false,
  showChip = true,
  children,
}: {
  playlist: Pick<PersonalPlaylist, "title" | "videoCount" | "totalDurationSeconds" | "summary">;
  className?: string;
  sizes?: string;
  priority?: boolean;
  showChip?: boolean;
  children?: React.ReactNode;
}) {
  const count = playlist.videoCount || 0;
  const summary = playlist.summary;
  const percent = completionPercent(summary, count);

  return (
    <StackedCover
      className={className}
      layers={stackLayers(count)}
      empty={count === 0}
      src={summary?.covers?.[0]}
      videoUrl={summary?.coverVideoUrls?.[0]}
      alt={`${playlist.title} cover`}
      progressPercent={percent}
      completed={percent >= 100}
      sizes={sizes}
      priority={priority}
      chip={
        showChip && count > 0 ? (
          <>
            <ListVideo className="h-3 w-3" aria-hidden />
            {count} video{count === 1 ? "" : "s"}
            {!!playlist.totalDurationSeconds && <span className="opacity-80">· {formatWatchTime(playlist.totalDurationSeconds)}</span>}
          </>
        ) : undefined
      }
    >
      {children}
    </StackedCover>
  );
}
