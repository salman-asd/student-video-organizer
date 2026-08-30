"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import { isResumeEligible } from "@/lib/watchProgress";
import { formatWatchTime } from "@/lib/utils";
import { VideoCard } from "@/components/video/VideoCard";
import { toggleFavoriteAny, toggleWatchLaterAny, setPriorityAny, setWatchedAny } from "@/lib/videoActions";
import type { PersonalPlaylist, PriorityLevel, VideoWithState } from "@/types";
import { Clock3, FolderPlus, ListVideo, Plus, Star, Flag, Download, BookOpen, PlayCircle, CheckCircle2 } from "lucide-react";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user, profile } = useAuth();
  const { loading, videos, refresh } = useAllVideos(user?.uid);
  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);

  React.useEffect(() => {
    if (!user?.uid) return;
    listPersonalPlaylists(user.uid).then(setPlaylists).catch(() => setPlaylists([]));
  }, [user?.uid]);

  const continueWatching = React.useMemo(() => {
    return videos.filter((video) => !!video.state && isResumeEligible(video.state)).sort((a, b) => {
      const bLast = b.state?.lastWatchedAt ? tsMillis(b.state.lastWatchedAt) : 0;
      const aLast = a.state?.lastWatchedAt ? tsMillis(a.state.lastWatchedAt) : 0;
      return bLast - aLast || (b.state?.watchedPercentage || 0) - (a.state?.watchedPercentage || 0);
    }).slice(0, 4);
  }, [videos]);

  const watchLater = React.useMemo(() => videos.filter((video) => video.state?.isWatchLater).slice(0, 4), [videos]);
  const highPriority = React.useMemo(() => videos.filter((video) => video.state?.priority === "high").slice(0, 4), [videos]);
  const favorites = React.useMemo(() => videos.filter((video) => video.state?.isFavorite).slice(0, 4), [videos]);
  const recentlyAdded = React.useMemo(() => [...videos].sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt)).slice(0, 4), [videos]);

  const stats = React.useMemo(() => ({
    videos: videos.length,
    playlists: playlists.length,
    watched: videos.filter((v) => v.state?.status === "completed").length,
    unwatched: videos.filter((v) => v.state?.status !== "completed").length,
    favorites: videos.filter((v) => v.state?.isFavorite).length,
    watchLater: videos.filter((v) => v.state?.isWatchLater).length,
  }), [videos, playlists]);

  async function handleToggleFavorite(v: VideoWithState) {
    if (!user) return;
    await toggleFavoriteAny(user.uid, v, !v.state?.isFavorite);
    refresh();
  }
  async function handleToggleWatchLater(v: VideoWithState) {
    if (!user) return;
    await toggleWatchLaterAny(user.uid, v, !v.state?.isWatchLater);
    refresh();
  }
  async function handleSetPriority(v: VideoWithState, p: PriorityLevel) {
    if (!user) return;
    await setPriorityAny(user.uid, v, p);
    refresh();
  }
  async function handleToggleWatched(v: VideoWithState) {
    if (!user) return;
    await setWatchedAny(user.uid, v, v.state?.status !== "completed");
    refresh();
  }

  const firstPlaylistHref = playlists[0] ? `/my-playlists/${playlists[0].id}?add=1` : "/my-playlists";

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{greeting()}, {profile?.displayName?.split(" ")[0] || "there"}</p>
              <h1 className="font-display text-3xl font-semibold">What are you learning today?</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><Link href={firstPlaylistHref}><Plus className="h-4 w-4" /> Add Video</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/my-playlists"><FolderPlus className="h-4 w-4" /> Create Playlist</Link></Button>
              <Button asChild variant="outline" size="sm"><Link href="/my-playlists/import"><Download className="h-4 w-4" /> Import Playlist</Link></Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile icon={ListVideo} label="Videos" value={stats.videos} loading={loading} />
            <StatTile icon={BookOpen} label="Playlists" value={stats.playlists} loading={loading} />
            <StatTile icon={CheckCircle2} label="Watched" value={stats.watched} loading={loading} />
            <StatTile icon={PlayCircle} label="Unwatched" value={stats.unwatched} loading={loading} />
            <StatTile icon={Star} label="Favorites" value={stats.favorites} loading={loading} />
            <StatTile icon={Clock3} label="Watch Later" value={stats.watchLater} loading={loading} />
          </div>

          {!loading && stats.videos > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Watch progress</span>
                <span>{stats.watched} of {stats.videos} watched ({Math.round((stats.watched / stats.videos) * 100)}%)</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${Math.round((stats.watched / stats.videos) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DashboardSection
          title="Continue Watching" icon={PlayCircle} viewAllHref="/continue-learning" loading={loading}
          emptyText="Nothing in progress yet. Pick up a video from your library to continue learning."
          items={continueWatching}
          renderItem={(video) => (
            <VideoCard key={video.id} video={video} showActions onToggleFavorite={() => handleToggleFavorite(video)} onToggleWatchLater={() => handleToggleWatchLater(video)} onSetPriority={(p) => handleSetPriority(video, p)} onToggleWatched={() => handleToggleWatched(video)} />
          )}
        />
        <DashboardSection
          title="Watch Later" icon={Clock3} viewAllHref="/watch-later" loading={loading}
          emptyText="Nothing saved for later. Tap Watch Later on any video to keep it queued."
          items={watchLater}
          renderItem={(video) => (
            <VideoCard key={video.id} video={video} showActions onToggleFavorite={() => handleToggleFavorite(video)} onToggleWatchLater={() => handleToggleWatchLater(video)} onSetPriority={(p) => handleSetPriority(video, p)} onToggleWatched={() => handleToggleWatched(video)} />
          )}
        />
        <DashboardSection
          title="High Priority" icon={Flag} viewAllHref="/priority" loading={loading}
          emptyText="No high-priority videos yet. Mark a video as high priority when it needs attention."
          items={highPriority}
          renderItem={(video) => (
            <VideoCard key={video.id} video={video} showActions onToggleFavorite={() => handleToggleFavorite(video)} onToggleWatchLater={() => handleToggleWatchLater(video)} onSetPriority={(p) => handleSetPriority(video, p)} onToggleWatched={() => handleToggleWatched(video)} />
          )}
        />
        <DashboardSection
          title="Favorites" icon={Star} viewAllHref="/favorites" loading={loading}
          emptyText="No favorites yet. Save videos you want to revisit later."
          items={favorites}
          renderItem={(video) => (
            <VideoCard key={video.id} video={video} showActions onToggleFavorite={() => handleToggleFavorite(video)} onToggleWatchLater={() => handleToggleWatchLater(video)} onSetPriority={(p) => handleSetPriority(video, p)} onToggleWatched={() => handleToggleWatched(video)} />
          )}
        />
        <DashboardSection
          title="Recently Added" icon={ListVideo} loading={loading}
          emptyText="No recent videos yet. Add or import content to get started."
          items={recentlyAdded}
          renderItem={(video) => (
            <VideoCard key={video.id} video={video} showActions onToggleFavorite={() => handleToggleFavorite(video)} onToggleWatchLater={() => handleToggleWatchLater(video)} onSetPriority={(p) => handleSetPriority(video, p)} onToggleWatched={() => handleToggleWatched(video)} />
          )}
        />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><BookOpen className="h-4 w-4 text-accent" /> My Playlists</h2>
            <Link href="/my-playlists" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}
            </div>
          ) : playlists.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              You have no personal playlists yet. Create one to group videos by topic or course.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {playlists.slice(0, 4).map((playlist) => (
                <Link key={playlist.id} href={`/my-playlists/${playlist.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <ListVideo className="h-4 w-4" />
                        <span className="text-xs uppercase tracking-wide">Playlist</span>
                      </div>
                      <div className="space-y-1">
                        <h3 className="line-clamp-2 text-base font-medium">{playlist.title}</h3>
                        {playlist.description && <p className="line-clamp-2 text-sm text-muted-foreground">{playlist.description}</p>}
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{playlist.videoCount} videos{!!playlist.totalDurationSeconds && ` · ${formatWatchTime(playlist.totalDurationSeconds)}`}</span>
                        <BookOpen className="h-4 w-4" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatTile({ icon: Icon, label, value, loading }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 shadow-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
        <Icon className="h-4.5 w-4.5 text-accent" />
      </span>
      <div className="min-w-0">
        {loading ? <Skeleton className="h-6 w-8" /> : <p className="text-xl font-semibold leading-none">{value}</p>}
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  icon: Icon,
  viewAllHref,
  loading,
  emptyText,
  items,
  renderItem,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  viewAllHref?: string;
  loading: boolean;
  emptyText: string;
  items: VideoWithState[];
  renderItem: (video: VideoWithState) => React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">{Icon && <Icon className="h-4 w-4 text-accent" />} {title}</h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72 w-full rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{emptyText}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {items.map(renderItem)}
        </div>
      )}
    </section>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function tsMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}
