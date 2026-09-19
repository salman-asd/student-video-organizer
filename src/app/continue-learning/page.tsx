"use client";

import * as React from "react";
import Link from "next/link";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { Button } from "@/components/ui/button";
import { isResumeEligible } from "@/lib/watchProgress";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { cn, formatDuration } from "@/lib/utils";
import { ChevronDown, ChevronUp, LayoutGrid, Layers, Rows3 } from "lucide-react";
import { groupVideosByPlaylist } from "@/lib/groupByPlaylist";
import {
  DEFAULT_GROUP_LAYOUT, cardClassFor, gridClassFor, visibleVideosFor, type GroupLayout,
} from "@/lib/continueLearningLayout";
import type { VideoWithState } from "@/types";

export default function ContinueLearningPage() {
  return (
    <RequireAuth>
      <ContinueLearningContent />
    </RequireAuth>
  );
}

function ContinueLearningContent() {
  const { user } = useAuth();
  const { loading, videos } = useAllVideos(user?.uid);

  // Defaults to "wrapped" — a single scrolling row hidden below the fold is a
  // poor first impression, and wrapping needs no horizontal-scroll discovery.
  // Per-group view state. "packed" (the default for any playlist with more
  // than one video) shows the playlist as a single stacked card; the user then
  // picks either a single scrolling row or a wrapped grid.
  const [groupStates, setGroupStates] = React.useState<Record<string, GroupLayout>>({});

  function setGroupState(key: string, next: GroupLayout) {
    setGroupStates((prev) => ({ ...prev, [key]: next }));
  }

  const continueWatching = React.useMemo(
    () => videos.filter((v) => !!v.state && isResumeEligible(v.state)).sort((a, b) => {
      const bTime = b.state?.lastWatchedAt ? tsMillis(b.state.lastWatchedAt) : 0;
      const aTime = a.state?.lastWatchedAt ? tsMillis(a.state.lastWatchedAt) : 0;
      return bTime - aTime || (b.state?.watchedPercentage || 0) - (a.state?.watchedPercentage || 0);
    }),
    [videos]
  );

  // Grouped by playlist for readability, but each group keeps the same
  // most-recently-watched-first ordering the flat list used before —
  // there's no manual reorder here (no drag-and-drop), just a computed
  // resume queue split into sections.
  const groups = React.useMemo(() => groupVideosByPlaylist(continueWatching), [continueWatching]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Continue Watching</h1>
            <p className="text-sm text-muted-foreground">Resume videos with real progress, grouped by playlist, most recently watched first.</p>
          </div>


        </div>

        {!loading && continueWatching.length === 0 && (
          <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nothing here yet. Start a video to build your resume queue.
          </div>
        )}

        {groups.map((group, groupIndex) => {
          const key = group.playlistId ?? "other";
          const state = groupStates[key] ?? (group.videos.length > 1 ? DEFAULT_GROUP_LAYOUT : "row");
          const visible = visibleVideosFor(group.videos, state);

          return (
            <section key={key} className="space-y-2.5">
              {/* Title and its controls are stacked, so the buttons sit directly
                  BELOW the group name rather than pushed to the far right. */}
              <div className="space-y-1.5">
                <h2 className="font-display text-base font-semibold">
                  {group.playlistTitle}{" "}
                  <span className="text-xs font-normal text-muted-foreground">({group.videos.length})</span>
                </h2>

                {group.videos.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {state === "packed" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setGroupState(key, "row")}
                        aria-expanded={false}
                        className="h-7 gap-1 px-2 text-xs"
                      >
                        <ChevronDown className="h-3.5 w-3.5" /> Show more
                      </Button>
                    ) : (
                      <>
                        {/* In single-row mode, offer the wrapped alternative
                            right beside it, so switching is one click either
                            way rather than a round trip through "show more". */}
                        <Button
                          type="button"
                          size="sm"
                          variant={state === "row" ? "default" : "outline"}
                          onClick={() => setGroupState(key, "row")}
                          aria-pressed={state === "row"}
                          className="h-7 gap-1 px-2 text-xs"
                        >
                          <Rows3 className="h-3.5 w-3.5" /> Single row
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={state === "wrap" ? "default" : "outline"}
                          onClick={() => setGroupState(key, "wrap")}
                          aria-pressed={state === "wrap"}
                          className="h-7 gap-1 px-2 text-xs"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" /> Wrap
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setGroupState(key, "packed")}
                          className="h-7 gap-1 px-2 text-xs"
                        >
                          <ChevronUp className="h-3.5 w-3.5" /> Pack
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Keyed by layout so switching between packed/row/wrap remounts
                  the cards — a plain class swap cannot animate them in, and a
                  packed card must not keep a stale entrance delay. */}
              <div key={state} className={gridClassFor(state)}>
                {visible.map((video, index) => (
                  <ContinueWatchingCard
                    key={video.id}
                    video={video}
                    priority={groupIndex === 0 && index === 0}
                    layout={state}
                    // The packed card is the whole playlist's entry point, so it
                    // carries the count badge and the stacked-cards affordance.
                    packedCount={state === "packed" ? group.videos.length : undefined}
                    enterDelayMs={Math.min(index, 7) * 45}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function ContinueWatchingCard({
  video,
  priority = false,
  layout,
  packedCount,
  enterDelayMs = 0,
}: {
  video: VideoWithState;
  priority?: boolean;
  layout: GroupLayout;
  /** Set only on a packed card: how many videos the playlist holds. */
  packedCount?: number;
  /** Stagger for the card's entrance, so a grid settles in left-to-right. */
  enterDelayMs?: number;
}) {
  const progress = Math.max(0, Math.min(100, video.state?.watchedPercentage || 0));
  const savedSeconds = Math.max(0, video.state?.currentPositionSeconds || 0);
  const resumeUrl = getVideoWatchHref(video);
  const packed = layout === "packed";
  const deckCount = packed ? Math.min(3, Math.max(2, packedCount ?? 2)) : 0;

  // "N videos" reads as redundant for a two-video playlist, where the two
  // stacked panels already say it. Keyed off the true count, not the panels.
  const stackLabel =
    (packedCount ?? 0) > 2 ? `${packedCount} videos` : (packedCount ?? 0) === 2 ? "2 videos" : null;

  return (
    <div
      className={cn(
        "group relative animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none",
        cardClassFor(layout),
        // Reserve room for the stacked panels, which translate outside the
        // card's own box — otherwise the next card on the line clips them.
        packed && "pb-2.5 pr-2.5"
      )}
      style={{
        animationDelay: enterDelayMs ? `${enterDelayMs}ms` : undefined,
      }}
    >
      {/* Stacked-deck affordance: offset panels stepped down-and-right BEHIND
          the real card, each one further out than the last. They carry an
          explicit glass tint rather than inheriting the theme's card colour,
          which is near-black in dark mode and left the fan invisible. */}
      {packed &&
        Array.from({ length: deckCount }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "absolute inset-0 rounded-xl border-border/70 shadow-sm",
              "bg-[hsl(160_18.75%_24.77%_/_0.6)] backdrop-blur-sm",
              "transition-transform duration-300 ease-out",
              "group-hover:translate-x-2.5 group-hover:translate-y-2.5"
            )}
            style={{ transform: `translate(${6 + i * 7}px, ${6 + i * 7}px)` }}
          />
        ))}

      <div className="relative overflow-hidden rounded-xl border-border bg-card shadow-sm transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-1 group-hover:ring-primary/30">
        <Link href={resumeUrl} className="block">
          <VideoThumbnail
            src={video.thumbnailUrl}
            alt={video.title}
            title={video.title}
            videoUrl={video.videoUrl}
            className="aspect-video"
            sizes="210px"
            priority={priority}
            progressPercent={progress}
          >
            {packed ? (
              // The count badge sits bottom-right, matching the stacked-folder
              // look: the thumbnail plus "N videos" is the whole card.
              stackLabel ? (
                <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm ring-1 ring-white/15">
                  <Layers className="h-3 w-3" aria-hidden />
                  {stackLabel}
                </span>
              ) : null
            ) : (
              <span className="absolute inset-x-1.5 bottom-3 flex items-end justify-between gap-2">
                {video.durationSeconds ? (
                  <span className="ml-auto rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {formatDuration(video.durationSeconds)}
                  </span>
                ) : null}
              </span>
            )}
          </VideoThumbnail>
        </Link>

        {/* Deliberately terse: this page is a resume queue, so the card shows
            the title and one line of progress context, nothing more. */}
        <div className="space-y-1 p-2">
          {packed && (
            // Playlist name is the card's eyebrow: it identifies the deck, and
            // frees the meta line below to carry progress only.
            <p className="truncate text-[10px] font uppercase tracking-wide text-muted-foreground/80">
              {video.playlistTitle || "Library"}
            </p>
          )}
          <h3 className="line-clamp-2 text-xs font-medium leading-snug">{video.title}</h3>
          <p className="text-[10px] text-muted-foreground">
            {packed
              ? `${savedSeconds > 0 ? formatDuration(savedSeconds) : "Start"} saved · ${progress}%`
              : savedSeconds > 0
                ? `Saved ${formatDuration(savedSeconds)} · ${progress}%`
                : `${progress}% watched`}
          </p>
          <Button asChild size="sm" className="mt-0.5 h-7 w-full text-xs">
            <Link href={resumeUrl}>{packed ? "Open playlist" : "Continue"}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function LayoutButton({
  active,
  onClick,
  icon: Icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  title: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className="gap-1.5"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

function tsMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return 0;
}

function formatTimestamp(value: any): string {
  if (!value) return "Recently";
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return "Recently";
}
