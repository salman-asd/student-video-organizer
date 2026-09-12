"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useAllVideos } from "@/hooks/useAllVideos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import { listQuizAttempts } from "@/lib/firestore/quizAttempts";
import { listGoals } from "@/lib/firestore/goals";
import { listLearningRoadmaps } from "@/lib/firestore/roadmaps";
import { getTopCategoryMastery } from "@/lib/masteryUtils";
import { computeDailyPace } from "@/lib/goalUtils";
import { isResumeEligible } from "@/lib/watchProgress";
import { formatWatchTime } from "@/lib/utils";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { VideoCard } from "@/components/video/VideoCard";
import { QuickAddVideoDialog } from "@/components/video/QuickAddVideoDialog";
import { toggleFavoriteAny, toggleWatchLaterAny, setPriorityAny, setWatchedAny } from "@/lib/videoActions";
import type { PersonalPlaylist, PriorityLevel, VideoWithState } from "@/types";
import { Clock3, ListVideo, Plus, Star, Flag, BookOpen, PlayCircle, CheckCircle2, Sparkles } from "lucide-react";

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
  const [goals, setGoals] = React.useState<any[]>([]);
  const [roadmaps, setRoadmaps] = React.useState<any[]>([]);
  const [quizGrowth, setQuizGrowth] = React.useState<Array<{ categoryId: string; categoryName: string; mastery: number; attempts: number }>>([]);
  const [saveVideoOpen, setSaveVideoOpen] = React.useState(false);

  React.useEffect(() => {
    if (!user?.uid) return;
    Promise.all([
      listPersonalPlaylists(user.uid),
      listGoals(user.uid),
      listLearningRoadmaps(user.uid),
    ])
      .then(([nextPlaylists, nextGoals, nextRoadmaps]) => {
        setPlaylists(nextPlaylists);
        setGoals(nextGoals);
        setRoadmaps(nextRoadmaps);
      })
      .catch(() => {
        setPlaylists([]);
        setGoals([]);
        setRoadmaps([]);
      });
  }, [user?.uid]);

  React.useEffect(() => {
    if (!user?.uid) return;
    listQuizAttempts(user.uid)
      .then((attempts) => {
        const uniqueCategories = Array.from(new Set(attempts.map((attempt) => attempt.categoryId).filter(Boolean))) as string[];
        const categories = uniqueCategories.map((id) => ({ id, name: id }));
        setQuizGrowth(getTopCategoryMastery(attempts, categories, new Date(), 3));
      })
      .catch(() => setQuizGrowth([]));
  }, [user?.uid]);

  const progressRows = React.useMemo(() => {
    const interestRows = (profile?.interests ?? []).map((interest) => {
      const roadmap = (roadmaps || []).filter((item) => item.categoryId === interest.categoryId);
      const selectedRoadmap = roadmap.find((item) => item.level === interest.level) || roadmap[0];
      const stepCount = selectedRoadmap?.steps?.length ?? 0;
      const matchedVideos = videos.filter((video) => video.categoryId === interest.categoryId && video.state?.status === "completed").length;
      const roadmapCompletion = stepCount > 0 ? Math.min(100, Math.round((matchedVideos / Math.max(stepCount, 1)) * 100)) : 0;
      const mastery = quizGrowth.find((row) => row.categoryId === interest.categoryId)?.mastery ?? 0;
      const paceGoals = goals.filter((goal) => !goal.completed && goal.targetDate);
      const paceSummary = paceGoals.length > 0 ? computeDailyPace(paceGoals[0], videos, new Date()) : { videosRemaining: 0, daysRemaining: 0, videosPerDayNeeded: 0, status: "on-track" as const };

      return {
        categoryId: interest.categoryId,
        categoryName: interest.categoryId,
        roadmapCompletion,
        mastery,
        pace: paceSummary.status,
      };
    });

    return interestRows.length > 0 ? interestRows : [];
  }, [profile?.interests, roadmaps, quizGrowth, goals, videos]);

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

  const stats = React.useMemo(() => {
    const completed = videos.filter((v) => v.state?.status === "completed");
    const activeGoals = goals.filter((goal) => !goal.completed);
    const dueSoon = activeGoals.filter((goal) => {
      if (!goal.targetDate) return false;
      const target = tsMillis(goal.targetDate);
      const daysRemaining = Math.ceil((target - Date.now()) / 86400000);
      return daysRemaining >= 0 && daysRemaining <= 7;
    }).length;

    return {
      videos: videos.length,
      playlists: playlists.length,
      watched: completed.length,
      unwatched: videos.filter((v) => v.state?.status !== "completed").length,
      favorites: videos.filter((v) => v.state?.isFavorite).length,
      watchLater: videos.filter((v) => v.state?.isWatchLater).length,
      focusTopics: profile?.interests?.length ?? 0,
      activeGoals: activeGoals.length,
      dueSoon,
      studyMinutes: Math.round(completed.reduce((sum, video) => sum + (Number(video.durationSeconds || 0) || 0), 0) / 60),
    };
  }, [videos, playlists, goals, profile?.interests]);

  const roadmapRecommendations = React.useMemo(() => {
    if (!profile?.interests || profile.interests.length === 0) return [];

    return profile.interests
      .map((interest) => {
        const relevantRoadmaps = (roadmaps || []).filter((roadmap) => roadmap.categoryId === interest.categoryId);
        const selected = relevantRoadmaps.find((roadmap) => roadmap.level === interest.level) || relevantRoadmaps[0];
        const nextStep = selected?.steps?.[0]?.title || "Choose your next topic focus";
        const categoryVideos = videos.filter((video) => video.categoryId === interest.categoryId);
        const completedCount = categoryVideos.filter((video) => video.state?.status === "completed").length;
        const totalCount = Math.max(selected?.steps?.length || 1, categoryVideos.length || 1);
        const progress = Math.min(100, Math.round((completedCount / totalCount) * 100));

        return {
          id: `${interest.categoryId}-${interest.level ?? "basic"}`,
          title: interest.categoryId,
          label: selected ? `${selected.level} roadmap` : "Roadmap ready",
          nextStep,
          progress,
        };
      })
      .filter((item) => item.title)
      .slice(0, 3);
  }, [profile?.interests, roadmaps, videos]);

  const coachingCards = React.useMemo(() => {
    const cards: Array<{ id: string; type: string; title: string; detail: string; meta: string; href: string }> = [];

    const focus = roadmapRecommendations[0];
    if (focus) {
      cards.push({
        id: "focus",
        type: "Focus now",
        title: focus.title,
        detail: `Next topic: ${focus.nextStep}`,
        meta: `${focus.progress}% progress`,
        href: "/roadmap",
      });
    }

    const goal = goals.filter((item) => !item.completed).sort((a, b) => {
      const aDate = a.targetDate ? tsMillis(a.targetDate) : Number.MAX_SAFE_INTEGER;
      const bDate = b.targetDate ? tsMillis(b.targetDate) : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    })[0];

    if (goal) {
      const pace = computeDailyPace(goal, videos, new Date());
      cards.push({
        id: `goal-${goal.id}`,
        type: "Goal pace",
        title: goal.title,
        detail: pace.status === "behind" ? "You’re a bit behind. Try a short focused session tonight." : pace.status === "overdue" ? "This goal needs attention soon." : "You’re on track — keep the streak going.",
        meta: pace.videosPerDayNeeded > 0 ? `${pace.videosPerDayNeeded} videos/day` : "Progress is healthy",
        href: "/goals",
      });
    } else {
      cards.push({
        id: "goal-empty",
        type: "Goal pace",
        title: "Create a goal",
        detail: "Set a learning target to get more personalized guidance and pace tracking.",
        meta: "No active goals yet",
        href: "/goals",
      });
    }

    const nextVideo = continueWatching[0] || highPriority[0] || favorites[0] || recentlyAdded[0];
    if (nextVideo) {
      cards.push({
        id: `video-${nextVideo.id}`,
        type: "Suggested next step",
        title: nextVideo.title,
        detail: nextVideo.state?.watchedPercentage ? `Resume from ${nextVideo.state.watchedPercentage}% progress.` : "A strong next session to keep momentum moving.",
        meta: nextVideo.state?.status === "completed" ? "Completed" : "Open video",
        href: getVideoWatchHref(nextVideo),
      });
    }

    return cards.slice(0, 3);
  }, [continueWatching, favorites, goals, highPriority, recentlyAdded, roadmapRecommendations, videos]);

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
              <Button size="sm" onClick={() => setSaveVideoOpen(true)}><Plus className="h-4 w-4" /> Save Video</Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile icon={ListVideo} label="Videos" value={stats.videos} loading={loading} />
            <StatTile icon={BookOpen} label="Playlists" value={stats.playlists} loading={loading} />
            <StatTile icon={CheckCircle2} label="Watched" value={stats.watched} loading={loading} />
            <StatTile icon={PlayCircle} label="Study min" value={stats.studyMinutes} loading={loading} />
            <StatTile icon={Flag} label="Goals" value={stats.activeGoals} loading={loading} />
            <StatTile icon={Clock3} label="Due soon" value={stats.dueSoon} loading={loading} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile icon={Star} label="Favorites" value={stats.favorites} loading={loading} />
            <StatTile icon={Clock3} label="Watch Later" value={stats.watchLater} loading={loading} />
            <StatTile icon={Sparkles} label="Focus topics" value={stats.focusTopics} loading={loading} />
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

        {coachingCards.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles className="h-4 w-4 text-accent" /> AI Learning Coach</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {coachingCards.map((card) => (
                <Link key={card.id} href={card.href} className="block rounded-lg border border-border bg-background/60 p-3 transition-colors hover:border-accent/60 hover:bg-accent/5">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{card.type}</span>
                    <Badge variant="secondary">{card.meta}</Badge>
                  </div>
                  <p className="font-medium">{card.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{card.detail}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {roadmapRecommendations.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Roadmap Recommendations</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {roadmapRecommendations.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{item.title}</span>
                    <Badge variant="secondary">{item.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Next up: {item.nextStep}</p>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span>Focus progress</span>
                      <span>{item.progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {quizGrowth.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Your Growth</h2>
            </div>
            <div className="space-y-3">
              {quizGrowth.map((row) => (
                <div key={row.categoryId} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span>{row.categoryName}</span>
                    <span>{Math.round(row.mastery * 100)}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(row.mastery * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {progressRows.length > 0 && (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Your Progress</h2>
            </div>
            <div className="space-y-3">
              {progressRows.map((row) => (
                <div key={row.categoryId} className="rounded-lg border border-border bg-background/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{row.categoryName}</span>
                    <span className="text-muted-foreground">{row.pace === "overdue" ? "Overdue" : row.pace === "behind" ? "Behind" : row.pace === "ahead" ? "Ahead" : "On track"}</span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Roadmap</span><span>{row.roadmapCompletion}%</span></div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${row.roadmapCompletion}%` }} /></div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Mastery</span><span>{Math.round(row.mastery * 100)}%</span></div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(row.mastery * 100)}%` }} /></div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Pace</span><span>{row.pace}</span></div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-emerald-500" style={{ width: row.pace === "behind" ? "35%" : row.pace === "overdue" ? "20%" : row.pace === "ahead" ? "80%" : "60%" }} /></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><BookOpen className="h-4 w-4 text-accent" /> Playlists</h2>
            <Link href="/playlists" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
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
                <Link key={playlist.id} href={`/playlists/${playlist.id}`}>
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
      {user?.uid && <QuickAddVideoDialog
        ownerId={user.uid}
        playlists={playlists}
        open={saveVideoOpen}
        onOpenChange={setSaveVideoOpen}
        onSaved={() => listPersonalPlaylists(user.uid).then(setPlaylists).catch(() => {})}
      />}
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
