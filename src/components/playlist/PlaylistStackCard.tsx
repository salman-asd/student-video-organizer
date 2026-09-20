"use client";

import * as React from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Globe, Link2, ListVideo, Lock, MoreVertical, Pencil, Play, Share2, Trash2 } from "lucide-react";
import { PlaylistCover } from "@/components/playlist/PlaylistCover";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { completionPercent, millis } from "@/lib/playlistSummary";
import { cn, formatWatchTime } from "@/lib/utils";
import type { PersonalPlaylist, PersonalPlaylistVisibility } from "@/types";

const VISIBILITY: Record<PersonalPlaylistVisibility, { label: string; Icon: typeof Lock }> = {
  private: { label: "Private — only you", Icon: Lock },
  link: { label: "Anyone with the link", Icon: Link2 },
  public: { label: "Public", Icon: Globe },
};

export type PlaylistCardAction = "share" | "edit" | "delete";

export interface PlaylistStackCardProps {
  playlist: PersonalPlaylist;
  /** Where the card opens. */
  href: string;
  /** Query suffix to keep admin `?owner=` browsing intact, e.g. "?owner=abc". */
  ownerQuery?: string;
  categoryName?: string | null;
  tagNames?: string[];
  variant?: "grid" | "list";
  priority?: boolean;
  /** Hide Share/Edit/Delete (e.g. admin browsing someone else's playlists). */
  readOnly?: boolean;
  onAction?: (action: PlaylistCardAction, playlist: PersonalPlaylist) => void;
  /** Tour anchor name, applied to the card root. */
  tourAnchor?: string;
}

function lastWatchedLabel(playlist: PersonalPlaylist): string | null {
  const ms = millis(playlist.summary?.lastWatchedAt);
  if (!ms) return null;
  return `${formatDistanceToNowStrict(new Date(ms))} ago`;
}

export function PlaylistStackCard({
  playlist, href, ownerQuery = "", categoryName, tagNames = [], variant = "grid", priority, readOnly, onAction, tourAnchor,
}: PlaylistStackCardProps) {
  const count = playlist.videoCount || 0;
  const summary = playlist.summary;
  const percent = completionPercent(summary, count);
  const done = summary?.completedCount ?? 0;
  const vis = VISIBILITY[playlist.visibility] ?? VISIBILITY.private;
  const nextId = summary?.nextVideoId ?? null;
  const allWatched = count > 0 && !!summary && !nextId;
  const title = playlist.isUnsorted ? "Unsorted" : playlist.title;
  const watched = lastWatchedLabel(playlist);
  const isList = variant === "list";

  const overlay = (
    <>
      {!playlist.isUnsorted && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white" aria-label={vis.label}>
              <vis.Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{vis.label}</TooltipContent>
        </Tooltip>
      )}
      {!readOnly && onAction && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* Always visible (no hover-only control) so it works on touch. */}
            <button
              type="button"
              aria-label={`Actions for ${title}`}
              className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAction("share", playlist)}><Share2 className="mr-2 h-4 w-4" /> Share</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("edit", playlist)}><Pencil className="mr-2 h-4 w-4" /> Edit details</DropdownMenuItem>
            {!playlist.isUnsorted && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onAction("delete", playlist)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  const meta = (
    <p className="text-xs text-muted-foreground">
      {count === 0 ? "No videos yet" : summary ? `${done}/${count} watched${watched ? ` · ${watched}` : ""}` : `${count} video${count === 1 ? "" : "s"}`}
    </p>
  );

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5">
      {categoryName && <Badge variant="outline" className="max-w-[10rem] truncate">{categoryName}</Badge>}
      {tagNames.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="relative z-10 rounded-full text-xs text-muted-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {tagNames.length === 1 ? tagNames[0] : `${tagNames.length} tags`}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5">{tagNames.map((name) => <Badge key={name} variant="outline">{name}</Badge>)}</div>
          </PopoverContent>
        </Popover>
      )}
      {!categoryName && tagNames.length === 0 && <span className="text-xs text-muted-foreground">No category or tags</span>}
    </div>
  );

  const cta =
    count === 0 || playlist.isUnsorted ? null : allWatched ? (
      <Badge variant="success" className="w-fit">Completed</Badge>
    ) : nextId ? (
      <Button asChild size="sm" className="relative z-10 w-fit gap-1.5" data-tour={tourAnchor === "pl-first-card" ? "pl-continue" : undefined}>
        <Link href={`/playlists/${playlist.id}/${nextId}${ownerQuery}`}>
          <Play className="h-3.5 w-3.5" aria-hidden /> {done > 0 ? "Continue" : "Start"}
        </Link>
      </Button>
    ) : null;

  const titleLink = (
    // "Stretched link": the whole card is clickable through this one anchor, while the
    // kebab / tags / Continue sit above it. Avoids nesting interactive elements in <a>.
    <Link href={href} className={cn("line-clamp-2 font-medium leading-snug after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:rounded-xl", playlist.isUnsorted && "italic")}>
      {title}
    </Link>
  );

  if (isList) {
    return (
      <div data-tour={tourAnchor} className="relative flex items-center gap-4 rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md">
        <div className="w-40 shrink-0 sm:w-48">
          <PlaylistCover playlist={playlist} sizes="192px" priority={priority}>{overlay}</PlaylistCover>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          {titleLink}
          {playlist.description && <p className="line-clamp-1 text-sm text-muted-foreground">{playlist.description}</p>}
          {meta}
          {chips}
        </div>
        <div className="hidden shrink-0 sm:block">{cta}</div>
      </div>
    );
  }

  return (
    <div data-tour={tourAnchor} className="group relative flex h-full flex-col gap-3">
      <PlaylistCover playlist={playlist} priority={priority}>{overlay}</PlaylistCover>
      <div className="flex flex-1 flex-col gap-1.5 px-1">
        {titleLink}
        {meta}
        {chips}
        {percent > 0 && percent < 100 && <span className="sr-only">{percent}% complete</span>}
        {cta && <div className="mt-auto pt-1.5">{cta}</div>}
      </div>
    </div>
  );
}
