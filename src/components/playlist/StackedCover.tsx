"use client";

import * as React from "react";
import { ListVideo, Plus } from "lucide-react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { cn } from "@/lib/utils";

/**
 * Presentational "stacked deck" cover — the single visual used for a playlist/group anywhere in
 * the app (Playlists page, playlist detail hero, Continue Learning). Callers decide WHAT to show
 * (which thumbnail, what the progress bar means, what the chip says); this decides HOW.
 *
 * - `layers` 0/1/2 decorative panels peek out above the front card and fan out on hover
 *   (only when the user hasn't asked for reduced motion).
 * - The picture goes through VideoThumbnail (fallback tile, Facebook no-referrer, progress bar).
 *   Never render <Image> directly here — that is what broke Facebook thumbnails before.
 */
export function StackedCover({
  layers = 0,
  src,
  videoUrl,
  alt,
  progressPercent,
  completed,
  empty,
  emptyLabel = "Empty — add videos",
  chip,
  sizes = "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw",
  priority = false,
  className,
  children,
}: {
  layers?: 0 | 1 | 2;
  src?: string | null;
  videoUrl?: string | null;
  alt: string;
  progressPercent?: number;
  completed?: boolean;
  /** Dashed "nothing here" state (e.g. a playlist with no videos). */
  empty?: boolean;
  emptyLabel?: string;
  /** Bottom-right pill, e.g. "12 videos · 3h". */
  chip?: React.ReactNode;
  sizes?: string;
  priority?: boolean;
  className?: string;
  /** Overlay controls (visibility icon, kebab). Must position themselves absolutely. */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("group/stack relative pt-3", className)}>
      {layers >= 2 && (
        <span aria-hidden className="absolute inset-x-8 top-0 h-6 rounded-t-xl border border-border bg-muted/60 transition-transform duration-200 motion-safe:group-hover/stack:-translate-y-1" />
      )}
      {layers >= 1 && (
        <span aria-hidden className="absolute inset-x-4 top-1.5 h-6 rounded-t-xl border border-border bg-secondary transition-transform duration-200 motion-safe:group-hover/stack:-translate-y-0.5" />
      )}

      <div className={cn("relative z-[1] aspect-video overflow-hidden rounded-xl border bg-card shadow-sm", empty ? "border-dashed border-border" : "border-border")}>
        {empty ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Plus className="h-6 w-6" aria-hidden />
            <span className="text-xs font-medium">{emptyLabel}</span>
          </div>
        ) : src ? (
          <VideoThumbnail
            src={src}
            alt={alt}
            videoUrl={videoUrl ?? undefined}
            progressPercent={progressPercent}
            completed={completed}
            sizes={sizes}
            priority={priority}
          />
        ) : (
          // No usable picture yet: a neutral panel, not the "broken image" tile — nothing is wrong, it's just unset.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted text-muted-foreground">
            <ListVideo className="h-9 w-9 opacity-60" aria-hidden />
          </div>
        )}

        {chip && (
          <span className="pointer-events-none absolute bottom-3 right-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {chip}
          </span>
        )}

        {children}
      </div>
    </div>
  );
}
