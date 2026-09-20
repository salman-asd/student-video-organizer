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
import { listCategories } from "@/lib/firestore/categoriesTags";
import { getTopCategoryMastery } from "@/lib/masteryUtils";
import {
  buildCategoryNameMap, buildRoadmapFocusRows, buildGoalPaceRows, buildWeeklyActivity,
  countCompletedSince, isBrandNewUser, pickPrimaryFocus, resolveCategoryName,
} from "@/lib/dashboardUtils";
import { MotivationBanner } from "@/components/dashboard/MotivationBanner";
import { Sparkline, BarChart, DonutChart } from "@/components/ui/charts";
import { computeDailyPace, describeDueDate, getGoalLinkedPlaylists, getGoalLinkedVideos } from "@/lib/goalUtils";
import { TourChip } from "@/components/tour/TourChip";
import { getDueReviews } from "@/lib/reviewUtils";
import { trackLearningEvent } from "@/lib/analytics";
import { buildRecommendations } from "@/lib/recommendations";
import { findGoalsBehindPace, paceNotificationCopy, goalPaceMarker } from "@/lib/goalPace";
import { createNotificationIfAbsent, listNotifications } from "@/lib/firestore/notifications";
import { isResumeEligible } from "@/lib/watchProgress";
import { formatWatchTime } from "@/lib/utils";
import { getVideoWatchHref } from "@/lib/videoRoutes";
import { VideoCard } from "@/components/video/VideoCard";
import { QuickAddVideoDialog } from "@/components/video/QuickAddVideoDialog";
import { toggleFavoriteAny, toggleWatchLaterAny, setPriorityAny, setWatchedAny } from "@/lib/videoActions";
import type { Goal, LearningRoadmap, PersonalPlaylist, PriorityLevel, QuizAttempt, VideoWithState } from "@/types";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import {
  Clock3, ListVideo, Plus, Star, Flag, BookOpen, PlayCircle, CheckCircle2, Sparkles, Flame, Target, TrendingUp, BookOpenCheck,
} from "lucide-react";

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
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [roadmaps, setRoadmaps] = React.useState<LearningRoadmap[]>([]);
  const [categoryNames, setCategoryNames] = React.useState<Map<string, string>>(new Map());
  const [quizAttempts, setQuizAttempts] = React.useState<QuizAttempt[]>([]);
  const [saveVideoOpen, setSaveVideoOpen] = React.useState(false);

  React.useEffect(() => {
    if (!user?.uid) return;
    Promise.all([
      listPersonalPlaylists(user.uid),
      listGoals(user.uid),
      listLearningRoadmaps(user.uid),
      // Categories were never loaded here before, which is exactly why the
      // roadmap/coach cards showed raw category ids as titles. They're needed
      // to render a topic *name*, so they're part of the same load.
      listCategories(user.uid).catch(() => []),
    ])
      .then(([nextPlaylists, nextGoals, nextRoadmaps, nextCategories]) => {
        setPlaylists(nextPlaylists);
        setGoals(nextGoals);
        setRoadmaps(nextRoadmaps);
        setCategoryNames(buildCategoryNameMap(nextCategories));
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
        setQuizAttempts(attempts);
      })
      .catch(() => setQuizAttempts([]));
  }, [user?.uid]);

  // Quiz mastery needs the real category names too, so it's derived here
  // (after categoryNames loads) rather than inside the fetch above. Previously
  // this mapped id -> id, so "Your Growth" also listed raw ids as labels.
  const quizMastery = React.useMemo(() => {
    const uniqueCategories = Array.from(
      new Set(quizAttempts.map((attempt) => attempt.categoryId).filter(Boolean))
    ) as string[];
    const named = uniqueCategories.map((id) => ({ id, name: resolveCategoryName(id, categoryNames, "Other") }));
    return getTopCategoryMastery(quizAttempts, named, new Date(), 4);
  }, [quizAttempts, categoryNames]);


  const dueReviews = React.useMemo(() => getDueReviews(quizAttempts).slice(0, 1), [quizAttempts]);

  // ── Focus areas (Phase D + the title fix) ──
  // One row per interest that has a roadmap, with the real topic NAME and the
  // real current step. Previously the title was `interest.categoryId` (a raw
  // Firestore id) and "next step" was indexed with a count derived from a
  // different total than the progress bar — so label and bar disagreed.
  const focusRows = React.useMemo(
    () => buildRoadmapFocusRows(profile?.interests ?? [], roadmaps, videos as any, categoryNames),
    [profile?.interests, roadmaps, videos, categoryNames]
  );
  const primaryFocus = React.useMemo(() => pickPrimaryFocus(focusRows), [focusRows]);

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

  // ── Phase C3: Recommended for you ──
  // A smarter filter over the user's own library, not a discovery system.
  // Empty when nothing matches — rendered as nothing, per spec.
  const recommendations = React.useMemo(
    () => buildRecommendations({ videos, interests: profile?.interests ?? [], roadmaps, limit: 4 }),
    [videos, profile?.interests, roadmaps]
  );

  // ── Phase C4: behind-pace check, run on dashboard visit ──
  // Client-side on-load rather than a server cron: at this scale a scheduled
  // job is a lot of moving parts (and on the Spark plan, not available at
  // all) for a check that only needs to happen when the user is looking.
  React.useEffect(() => {
    if (!user?.uid || loading) return;
    let cancelled = false;

    void (async () => {
      try {
        const behind = findGoalsBehindPace(goals, videos);
        if (behind.length === 0) return;

        // Read existing notifications once so we don't re-notify for the same
        // goal on every single dashboard visit — that's the difference
        // between a useful nudge and noise the user learns to ignore.
        const existing = await listNotifications(user.uid, 50).catch(() => []);
        if (cancelled) return;

        const alreadyNotified = new Set(
          existing.filter((n) => n.type === "goal_pace").map((n) => goalPaceMarker(n.linkHref))
        );

        for (const entry of behind) {
          const marker = goalPaceMarker(`/goals?goal=${entry.goal.id}`);
          if (alreadyNotified.has(marker)) continue;
          await createNotificationIfAbsent(user.uid, {
            type: "goal_pace",
            title: `Behind pace: ${entry.goal.title}`,
            body: paceNotificationCopy(entry),
            linkHref: `/goals?goal=${entry.goal.id}`,
          });
          void trackLearningEvent(user.uid, "goal_behind_pace", { goalId: entry.goal.id });
        }
      } catch {
        // Best-effort: a missed nudge must never break the dashboard.
      }
    })();

    return () => { cancelled = true; };
  }, [user?.uid, loading, goals, videos]);

  const stats = React.useMemo(() => {
    const completed = videos.filter((v) => v.state?.status === "completed");
    const activeGoals = goals.filter((goal) => !goal.completed);
    const dueSoon = activeGoals.filter((goal) => {
      if (!goal.targetDate) return false;
      const target = tsMillis(goal.targetDate);
      const daysRemaining = Math.ceil((target - Date.now()) / 86400000);
      return daysRemaining >= 0 && daysRemaining <= 7;
    }).length;

    const inProgress = videos.filter((v) => v.state?.status === "in_progress").length;
    const watched = completed.length;

    return {
      videos: videos.length,
      playlists: playlists.length,
      watched,
      inProgress,
      completionPercent: videos.length > 0 ? Math.round((watched / videos.length) * 100) : 0,
      unwatched: videos.filter((v) => v.state?.status !== "completed").length,
      favorites: videos.filter((v) => v.state?.isFavorite).length,
      watchLater: videos.filter((v) => v.state?.isWatchLater).length,
      focusTopics: profile?.interests?.length ?? 0,
      activeGoals: activeGoals.length,
      dueSoon,
      studyMinutes: Math.round(completed.reduce((sum, video) => sum + (Number(video.durationSeconds || 0) || 0), 0) / 60),
    };
  }, [videos, playlists, goals, profile?.interests]);

  const goalRows = React.useMemo(() => buildGoalPaceRows(goals, videos as any), [goals, videos]);

  const weeklyActivity = React.useMemo(() => buildWeeklyActivity(videos), [videos]);
  const completedThisWeek = React.useMemo(() => weeklyActivity.reduce((sum, day) => sum + day.count, 0), [weeklyActivity]);

  const brandNew = React.useMemo(
    () => !loading && isBrandNewUser(profile?.interests ?? [], roadmaps, goals, videos.length),
    [loading, profile?.interests, roadmaps, goals, videos.length]
  );

  const coachingCards = React.useMemo(() => {
    const cards: Array<{ id: string; type: string; title: string; detail: string; meta: string; href: string }> = [];

    // Title is the topic NAME (via focusRows), never a raw category id.
    const focus = primaryFocus;
    if (focus) {
      cards.push({
        id: "focus",
        type: "Focus now",
        title: focus.categoryName,
        detail: `Step ${focus.currentStepIndex + 1} of ${focus.stepCount}: ${focus.currentStepTitle}`,
        meta: `${focus.progressPercent}% complete`,
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

    const review = dueReviews[0];
    const reviewVideo = review ? videos.find((video) => video.id === review.videoId) : null;
    const reviewGoal = reviewVideo
      ? goals.find((goal) => {
        const linkedVideo = getGoalLinkedVideos(goal).some((item) => item.id === reviewVideo.id);
        const linkedPlaylist = getGoalLinkedPlaylists(goal).some((item) => item.id === reviewVideo.playlistId);
        return !goal.completed && (linkedVideo || linkedPlaylist);
      })
      : null;
    if (review) {
      cards.push({
        id: `review-${review.videoId}`,
        type: "Review due",
        title: reviewVideo?.title || "Review a recent quiz",
        detail: reviewGoal
          ? `Review this for your goal: ${reviewGoal.title}.`
          : review.scorePercent < 80 ? "A quick revisit will help strengthen this topic." : "Refresh this topic while it is still familiar.",
        meta: reviewGoal ? "Linked to an active goal" : `${review.ageDays} days since quiz`,
        href: reviewGoal ? "/goals" : reviewVideo ? getVideoWatchHref(reviewVideo) : "/library",
      });
    }

    return cards.slice(0, 3);
  }, [continueWatching, dueReviews, favorites, goals, highPriority, recentlyAdded, primaryFocus, videos]);

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
        {/* Phase D: prominent, rotating motivation line. Sits above the stat
            strip so it is the first thing read, and is dismissible. */}
        <MotivationBanner
          input={{
            focus: primaryFocus,
            goalRows,
            recommendationCount: recommendations.length,
            completedThisWeek,
            streakDays: profile?.stats?.currentStreakDays ?? 0,
            totalVideos: videos.length,
          }}
        />

        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-card to-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{greeting()}, {profile?.displayName?.split(" ")[0] || "there"}</p>
              <h1 className="font-display text-3xl font-semibold">What are you learning today?</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TourChip tourId="welcome" />
              <Button size="sm" onClick={() => setSaveVideoOpen(true)}><Plus className="h-4 w-4" /> Save Video</Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-tour="dash-stats">
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
            <StatTile icon={Flame} label="Study streak" value={profile?.stats?.currentStreakDays ?? 0} loading={loading} />
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

        {!loading && (!profile?.interests || profile.interests.length === 0) && (
          <section className="rounded-2xl border border-dashed border-accent/50 bg-accent/5 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-accent">Choose your learning focus</p>
                <h2 className="mt-1 font-display text-xl font-semibold">Build a dashboard around what matters to you.</h2>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Select a few interests to unlock roadmap steps, recommendations, and more useful progress guidance.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild><Link href="/onboarding">Set up interests</Link></Button>
                <Button asChild variant="outline"><Link href="/settings">Review settings</Link></Button>
              </div>
            </div>
          </section>
        )}
        {/* Phase D: get started (brand-new user).
            A first-time user gets ONE clear next action instead of a wall of
            empty charts and zeros. */}
        {brandNew && (
          <section className="rounded-2xl border-dashed border-accent/50 bg-accent/5 p-6" data-tour="dash-getstarted">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-accent">Welcome to Study Lamp</p>
                <h2 className="font-display text-xl font-semibold">Three steps and this dashboard fills itself in.</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Pick what you want to learn, generate a roadmap, then set a goal with a deadline. Everything here —
                  pace, recommendations, charts — is built from those.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button asChild><Link href="/onboarding">Choose interests</Link></Button>
                <Button asChild variant="outline"><Link href="/playlists/import">Add videos</Link></Button>
              </div>
            </div>

            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { n: 1, title: "Pick your interests", detail: "Choose the topics you actually want to learn.", href: "/onboarding", cta: "Set interests" },
                { n: 2, title: "Generate a roadmap", detail: "Get an ordered path of steps for a topic.", href: "/roadmap", cta: "Open roadmap" },
                { n: 3, title: "Set a goal", detail: "Give a step a deadline so pace tracking kicks in.", href: "/goals", cta: "Open goals" },
              ].map((item) => (
                <li key={item.n} className="rounded-lg border-border bg-background/60 p-3">
                  <span className="mb-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                    {item.n}
                  </span>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                  <Button asChild size="sm" variant="link" className="mt-1 h-auto p-0 text-xs">
                    <Link href={item.href}>{item.cta} →</Link>
                  </Button>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Phase D: active roadmap — current step + completion. */}
        {focusRows.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <BookOpenCheck className="h-4 w-4 text-accent" /> Your roadmap
              </h2>
              <Link href="/roadmap" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {focusRows.slice(0, 3).map((row) => (
                <div key={row.id} className="space-y-2.5 rounded-xl border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    {/* row.categoryName is resolved from the real category doc.
                        This previously rendered interest.categoryId — a raw
                        Firestore id — which is the "wrong title" bug. */}
                    <p className="font-medium leading-tight">{row.categoryName}</p>
                    <Badge variant="secondary" className="shrink-0 capitalize">{row.level}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Step {row.currentStepIndex + 1} of {row.stepCount} — <span className="text-foreground">{row.currentStepTitle}</span>
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Roadmap progress</span>
                      <span>{row.progressPercent}%</span>
                    </div>
                    <Progress value={row.progressPercent} className="h-1.5" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {row.completedVideos} completed video{row.completedVideos === 1 ? "" : "s"} in this topic
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Phase D: goals with pace status. */}
        {goalRows.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Target className="h-4 w-4 text-accent" /> Active goals
              </h2>
              <Link href="/goals" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <div className="space-y-2">
              {goalRows.slice(0, 4).map((goal) => {
                const due = describeDueDate(goal.targetDate, false);
                const tone = goal.status === "overdue" ? "text-destructive" : goal.status === "behind" ? "text-amber-600" : "text-emerald-600";
                const label = goal.status === "ahead" ? "Ahead" : goal.status === "on-track" ? "On track" : goal.status === "behind" ? "Behind" : "Overdue";
                return (
                  <Link
                    key={goal.id}
                    href={`/goals?goal=${goal.id}`}
                    className="block rounded-xl border-border bg-card p-3.5 transition-colors hover:border-accent/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{goal.title}</span>
                      <span className="flex items-center gap-2 text-xs">
                        {due.label && <Badge variant="outline">{due.label}</Badge>}
                        <span className={cn("font-medium", tone)}>
                          {label}{goal.videosPerDayNeeded > 0 ? ` · ${goal.videosPerDayNeeded}/day` : ""}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      <Progress value={goal.progressPercent} className="h-1.5" />
                      <p className="text-[11px] text-muted-foreground">
                        {goal.watched} of {goal.total} watched{goal.videosRemaining > 0 ? ` · ${goal.videosRemaining} to go` : " · complete"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Phase D: charts. Real data only — each renders only when it has
            something to say, so a new user never sees an empty axis. */}
        {(weeklyActivity.some((day) => day.count > 0) || quizMastery.length > 0 || videos.length > 0) && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <TrendingUp className="h-4 w-4 text-accent" /> Your activity
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3 rounded-xl border-border bg-card p-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">Completed this week</p>
                  <p className="text-sm text-muted-foreground">{completedThisWeek} video{completedThisWeek === 1 ? "" : "s"}</p>
                </div>
                <Sparkline
                  values={weeklyActivity.map((day) => day.count)}
                  labels={weeklyActivity.map((day) => day.label)}
                  ariaLabel="Videos completed per day over the last seven days"
                />
                <p className="text-[11px] text-muted-foreground">
                  {completedThisWeek === 0
                    ? "Nothing finished in the last 7 days yet."
                    : `Average ${(completedThisWeek / 7).toFixed(1)} videos/day over 7 days.`}
                </p>
              </div>

              <div className="space-y-3 rounded-xl border-border bg-card p-4">
                <p className="text-sm font-medium">Library completion</p>
                <DonutChart
                  segments={[
                    { label: "Completed", value: stats.watched, className: "stroke-accent bg-accent" },
                    { label: "In progress", value: stats.inProgress, className: "stroke-primary bg-primary" },
                    { label: "Not started", value: stats.unwatched, className: "stroke-border bg-border" },
                  ]}
                  centerLabel={`${stats.completionPercent}%`}
                  centerSubLabel="of your library"
                  ariaLabel="Library completion breakdown"
                />
              </div>

              {focusRows.length > 0 && (
                <div className="space-y-3 rounded-xl border-border bg-card p-4">
                  <p className="text-sm font-medium">Progress by topic</p>
                  <BarChart
                    data={focusRows.map((row) => ({
                      label: row.categoryName,
                      value: row.completedVideos,
                      total: row.stepCount,
                    }))}
                    ariaLabel="Completed videos per focus topic against roadmap step count"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Bar shows completed videos; the lighter track is that topic&apos;s roadmap step count.
                  </p>
                </div>
              )}

              {quizMastery.length > 0 && (
                <div className="space-y-3 rounded-xl border-border bg-card p-4">
                  <p className="text-sm font-medium">Quiz mastery by topic</p>
                  <BarChart
                    data={quizMastery.map((row) => ({
                      label: row.categoryName,
                      value: Math.round(row.mastery * 100),
                    }))}
                    max={100}
                    formatValue={(value) => `${value}%`}
                    ariaLabel="Quiz mastery percentage by topic"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* Phase C3: recommendations. Rendered only when something actually
            matched — no empty-state card, per spec. */}
        {recommendations.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Sparkles className="h-4 w-4 text-accent" /> Recommended for you
              </h2>
              <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">Browse library</Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recommendations.map((item) => (
                <Link
                  key={item.video.id}
                  href={getVideoWatchHref(item.video)}
                  className="flex flex-col gap-2 rounded-lg border-border bg-background/60 p-3 transition-colors hover:border-accent/60 hover:bg-accent/5"
                >
                  <p className="line-clamp-2 text-sm font-medium">{item.video.title}</p>
                  <p className="text-[11px] text-muted-foreground">{item.video.playlistTitle}</p>
                  <p className="mt-auto line-clamp-2 text-[11px] text-accent">{item.reasonLabel}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Phase D: recent activity — continue watching. */}
        {continueWatching.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <PlayCircle className="h-4 w-4 text-accent" /> Continue watching
              </h2>
              <Link href="/continue-learning" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {continueWatching.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  showActions
                  onToggleFavorite={() => handleToggleFavorite(video)}
                  onToggleWatchLater={() => handleToggleWatchLater(video)}
                  onSetPriority={(p) => handleSetPriority(video, p)}
                  onToggleWatched={() => handleToggleWatched(video)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Phase D: AI Learning Coach — secondary, below the real data. */}
        {coachingCards.length > 0 && (
          <section className="space-y-3 rounded-2xl border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Sparkles className="h-4 w-4 text-accent" /> AI Learning Coach
            </h2>
            <div className="grid gap-3 md:grid-cols-3">
              {coachingCards.map((card) => (
                <Link key={card.id} href={card.href} className="block rounded-lg border-border bg-background/60 p-3 transition-colors hover:border-accent/60 hover:bg-accent/5">
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
