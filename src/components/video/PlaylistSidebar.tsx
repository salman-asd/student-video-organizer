"use client";

import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";
import type { PersonalVideo, Video } from "@/types";

interface PlaylistSidebarProps {
  videos: Array<Video | PersonalVideo>;
  currentVideoId: string;
  playlistId: string;
  ownerId?: string | null;
  title?: string | null;
  className?: string;
}

export function PlaylistSidebar({ videos, currentVideoId, playlistId, ownerId, title, className }: PlaylistSidebarProps) {
  const currentIndex = videos.findIndex((video) => video.id === currentVideoId);
  const prev = currentIndex > 0 ? videos[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < videos.length - 1 ? videos[currentIndex + 1] : null;

  return (
    <aside className={cn("rounded-xl border border-border bg-card/90 p-3 shadow-sm backdrop-blur-sm", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Playlist</p>
          <p className="line-clamp-2 text-sm font-medium text-foreground">{title || "Current playlist"}</p>
          <p className="text-xs text-muted-foreground">{videos.length} videos</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button asChild variant="outline" size="sm" disabled={!prev}>
            <Link href={getVideoHref(prev, playlistId, ownerId)} aria-label="Previous video">
              Prev
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={!next}>
            <Link href={getVideoHref(next, playlistId, ownerId)} aria-label="Next video">
              Next
            </Link>
          </Button>
        </div>
      </div>

      <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
        {videos.map((video, index) => {
          const isActive = video.id === currentVideoId;
          const href = getVideoHref(video, playlistId, ownerId);

          return (
            <Link
              key={video.id}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border p-2 transition-colors",
                isActive
                  ? "border-primary/60 bg-primary/5 shadow-sm"
                  : "border-transparent bg-secondary/20 hover:border-border hover:bg-secondary/30"
              )}
            >
              <div className="relative h-14 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                <Image src={video.thumbnailUrl} alt={video.title} fill className="object-cover" sizes="80px" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="w-5 text-center font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                  {isActive && <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px]">Now</Badge>}
                </div>
                <p className={cn("line-clamp-2 text-sm leading-snug", isActive ? "font-medium" : "font-normal")}>{video.title}</p>
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{formatDuration(video.durationSeconds)}</span>
                  {video.id === currentVideoId && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1 text-primary">
                        <PlayCircle className="h-3 w-3" /> Playing
                      </span>
                    </>
                  )}
                </div>
              </div>

              {video.id === currentVideoId ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function getVideoHref(video: Video | PersonalVideo | null, playlistId: string, ownerId?: string | null) {
  if (!video) return ownerId ? `/my-playlists/${playlistId}?owner=${ownerId}` : `/playlists/${playlistId}`;
  if (ownerId) return `/my-playlists/${playlistId}/${video.id}?owner=${ownerId}`;
  return `/video/${video.id}?playlist=${playlistId}`;
}
