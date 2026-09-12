"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoActionsBar } from "@/components/video/VideoActionsBar";
import { PlaylistSidebar } from "@/components/video/PlaylistSidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, Lock, PanelRightClose, PanelRightOpen, Sparkles, Trash2 } from "lucide-react";
import {
  getPersonalPlaylist, getPersonalVideo, listPersonalVideos, savePersonalVideoProgress, setPersonalVideoPriority,
  setPersonalVideoWatched, togglePersonalVideoFavorite, togglePersonalVideoWatchLater,
} from "@/lib/firestore/personalPlaylists";
import { deleteNote, getNote, getSummary, saveNote, saveSummary } from "@/lib/firestore/notes";
import { addBookmark, listBookmarks, removeBookmark } from "@/lib/firestore/bookmarks";
import { generateStarterSummary } from "@/lib/aiSummaryClient";
import { generateVideoQuizForCurrentVideo } from "@/lib/quizClient";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { formatDuration } from "@/lib/utils";
import { toSummaryHtml } from "@/lib/summaryHtml";
import { calculateProgress, shouldPersistProgress } from "@/lib/watchProgress";
import { getExternalWatchAction } from "@/lib/video-platforms";
import type { PersonalVideo, PriorityLevel, QuizQuestion } from "@/types";
import { toast } from "sonner";
import { getBackToPlaylistHref, shouldShowPlaylistSidebarOnRight, shouldUsePlaylistSidebar } from "@/lib/watchPage";

// Personal videos reuse the notes/summaries collections but namespace the
// doc id with a "p_" prefix so they can never collide with a shared-library
// video's notes, even though both are keyed by videoId under the same user.
const noteKey = (videoId: string) => `p_${videoId}`;

export default function PersonalVideoPage() {
  return (
    <RequireAuth>
      <PersonalVideoContent />
    </RequireAuth>
  );
}

function PersonalVideoContent() {
  const { playlistId, videoId } = useParams<{ playlistId: string; videoId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const ownerId = searchParams.get("owner") || user?.uid || "";
  const isViewingOther = ownerId !== user?.uid;
  const autoPlayRequested = searchParams.get("autoplay") === "1";

  const [video, setVideo] = React.useState<PersonalVideo | null>(null);
  const [playlistVideos, setPlaylistVideos] = React.useState<PersonalVideo[]>([]);
  const [playlistTitle, setPlaylistTitle] = React.useState<string>("Current playlist");
  const [autoPlay, setAutoPlay] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [generatingSummary, setGeneratingSummary] = React.useState(false);
  const [quizQuestions, setQuizQuestions] = React.useState<QuizQuestion[]>([]);
  const [quizLoading, setQuizLoading] = React.useState(false);
  const [selectedAnswers, setSelectedAnswers] = React.useState<Record<string, string>>({});
  const [quizSubmitted, setQuizSubmitted] = React.useState(false);
  const [quizResult, setQuizResult] = React.useState<{ score: number; total: number } | null>(null);
  const [bookmarks, setBookmarks] = React.useState<Array<{ id: string; videoId: string; timestampSeconds: number; label: string }>>([]);
  const [bookmarkLabel, setBookmarkLabel] = React.useState("");
  const [bookmarkTime, setBookmarkTime] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [playlistVisible, setPlaylistVisible] = React.useState(true);
  const [viewportWidth, setViewportWidth] = React.useState<number>(0);
  const lastProgressSaveRef = React.useRef(0);
  const previousProgressRef = React.useRef(0);

  React.useEffect(() => {
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  React.useEffect(() => {
    const saved = window.localStorage.getItem("videoPlaylistVisible");
    if (saved !== null) setPlaylistVisible(saved === "true");
  }, []);

  React.useEffect(() => {
    window.localStorage.setItem("videoPlaylistVisible", String(playlistVisible));
  }, [playlistVisible]);

  React.useEffect(() => {
    previousProgressRef.current = 0;
    lastProgressSaveRef.current = Date.now();
  }, [videoId]);

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [v, vids, n, sm, pl] = await Promise.all([
      getPersonalVideo(ownerId, playlistId, videoId),
      listPersonalVideos(ownerId, playlistId),
      getNote(ownerId, noteKey(videoId)),
      getSummary(ownerId, noteKey(videoId)),
      getPersonalPlaylist(ownerId, playlistId),
    ]);
    setVideo(v);
    setPlaylistVideos(vids);
    setPlaylistTitle(pl?.title || "Current playlist");
    setNote(n?.content || "");
    setSummary(sm?.content || "");
    setAutoPlay(!!pl?.autoPlay);
    setLoading(false);
  }, [ownerId, playlistId, videoId]);

  React.useEffect(() => { load(); }, [load]);

  const debouncedSaveSummary = useDebouncedCallback((val: string) => {
    if (ownerId) saveSummary(ownerId, noteKey(videoId), val);
  }, 900);

  const handleSummaryChange = React.useCallback((nextHtml: string) => {
    setSummary(nextHtml);
    debouncedSaveSummary(nextHtml);
  }, [debouncedSaveSummary]);

  async function handleSaveNote() {
    if (!ownerId) return;
    await saveNote(ownerId, noteKey(videoId), note);
    toast.success(note.trim() ? "Note saved" : "Note cleared");
  }

  async function handleDeleteNote() {
    if (!ownerId) return;
    await deleteNote(ownerId, noteKey(videoId));
    setNote("");
    toast.success("Note deleted");
  }

  async function handleGenerateQuiz() {
    if (!user || isViewingOther || !video || quizLoading) return;
    setQuizLoading(true);
    try {
      const idToken = await user.getIdToken();
      const response = await generateVideoQuizForCurrentVideo(idToken, {
        youtubeVideoId: video.youtubeVideoId || "",
        videoId,
        playlistId,
        title: video.title,
        description: video.description || "",
      });
      setQuizQuestions(response.questions || []);
      setSelectedAnswers({});
      setQuizSubmitted(false);
      setQuizResult(null);
      if (!response.questions?.length) {
        toast.error("No quiz questions were generated.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Couldn't generate a quiz right now.");
    } finally {
      setQuizLoading(false);
    }
  }

  async function handleQuizSubmit() {
    if (!user || !video || quizQuestions.length === 0) return;
    const total = quizQuestions.length;
    const score = quizQuestions.reduce((count, question) => {
      return count + (selectedAnswers[question.id] === question.correctOptionId ? 1 : 0);
    }, 0);
    setQuizResult({ score, total });
    setQuizSubmitted(true);

    try {
      const idToken = await user.getIdToken();
      await fetch("/api/quiz-attempts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.uid,
          videoId: video.id,
          categoryId: video.categoryId || null,
          score,
          totalQuestions: total,
        }),
      });
    } catch {
      // Intentionally non-blocking: the quiz can still be graded locally.
    }
  }

  async function handleAddBookmark() {
    if (!user || !video || !bookmarkLabel.trim()) return;
    const seconds = parseTimeToSeconds(bookmarkTime) ?? Math.round(video.currentPositionSeconds || 0);
    await addBookmark(user.uid, video.id, seconds, bookmarkLabel.trim());
    setBookmarkLabel("");
    setBookmarkTime("");
    setBookmarks(await listBookmarks(user.uid, video.id));
  }

  // Deliberately restricted to the owner viewing their own video: this
  // route always uses the *caller's* Gemini connection (see
  // src/app/api/ai/summary/route.ts), so an admin viewing someone else's
  // personal video (isViewingOther) would otherwise spend their own AI
  // quota to write into a student's private summary — outside what Phase 5
  // is meant to cover.
  async function handleGenerateSummary() {
    if (!user || isViewingOther || !video || generatingSummary) return;
    if (summary.trim() && !confirm("Replace your current summary with an AI-generated starter draft? This can't be undone.")) {
      return;
    }
    setGeneratingSummary(true);
    try {
      const idToken = await user.getIdToken();
      const draft = await generateStarterSummary(idToken, {
        youtubeVideoId: video.youtubeVideoId || "",
      });
      const draftHtml = toSummaryHtml(draft);
      setSummary(draftHtml);
      await saveSummary(ownerId, noteKey(videoId), draftHtml);
      toast.success("Starter summary generated — feel free to edit it.");
    } catch (error: any) {
      toast.error(error?.message || "Couldn't generate a summary right now.");
    } finally {
      setGeneratingSummary(false);
    }
  }

  const index = playlistVideos.findIndex((v) => v.id === videoId);
  const prev = index > 0 ? playlistVideos[index - 1] : null;
  const next = index >= 0 && index < playlistVideos.length - 1 ? playlistVideos[index + 1] : null;
  const suffix = isViewingOther ? `?owner=${ownerId}` : "";
  const backToPlaylistHref = getBackToPlaylistHref(playlistId, ownerId || null);
  const showPlaylistSidebar = playlistVisible;
  const sidebarOnRight = shouldShowPlaylistSidebarOnRight(viewportWidth || 1440);
  const externalWatchAction = React.useMemo(() => getExternalWatchAction(video?.videoUrl || ""), [video?.videoUrl]);

  async function handleProgress(cur: number, dur: number, force = false) {
    if (!ownerId || !video) return;
    const snapshot = calculateProgress(cur, dur);
    const shouldPersist = force || shouldPersistProgress({
      currentSeconds: cur,
      durationSeconds: dur,
      lastSavedAt: lastProgressSaveRef.current,
      now: Date.now(),
      previousSeconds: previousProgressRef.current,
    });

    setVideo((v) => (v ? {
      ...v,
      currentPositionSeconds: snapshot.currentSeconds,
      watchedPercentage: snapshot.percent,
      status: v.status === "completed" ? "completed" : (snapshot.percent > 0 ? "in_progress" : "not_started"),
    } : v));

    // Nothing worth persisting yet (player hasn't actually started).
    if (!shouldPersist || cur <= 0) return;

    await savePersonalVideoProgress(ownerId, playlistId, video.id, cur, snapshot.percent);
    lastProgressSaveRef.current = Date.now();
    previousProgressRef.current = cur;
  }

  async function handleEnded(cur: number, dur: number) {
    if (!ownerId || !video) return;
    const finalSeconds = Number.isFinite(cur) && cur > 0 ? cur : dur;
    await savePersonalVideoProgress(ownerId, playlistId, video.id, finalSeconds, 100);
    lastProgressSaveRef.current = Date.now();
    previousProgressRef.current = finalSeconds;
    setVideo((v) => (v ? { ...v, status: "completed", currentPositionSeconds: finalSeconds, watchedPercentage: 100 } : v));

    if (autoPlay && next) {
      toast.success(`Completed. Starting "${next.title}" next.`);
      const nextSuffix = isViewingOther ? `?owner=${ownerId}&autoplay=1` : "?autoplay=1";
      router.push(`/playlists/${playlistId}/${next.id}${nextSuffix}`);
    } else {
      toast.success("Nice work — video completed!");
    }
  }

  async function handleToggleFavorite() {
    if (!ownerId || !video) return;
    const nextVal = !video.isFavorite;
    await togglePersonalVideoFavorite(ownerId, playlistId, video.id, nextVal);
    setVideo((v) => (v ? { ...v, isFavorite: nextVal } : v));
  }

  async function handleToggleWatchLater() {
    if (!ownerId || !video) return;
    const nextVal = !video.isWatchLater;
    await togglePersonalVideoWatchLater(ownerId, playlistId, video.id, nextVal);
    setVideo((v) => (v ? { ...v, isWatchLater: nextVal } : v));
  }

  async function handleSetPriority(p: PriorityLevel) {
    if (!ownerId || !video) return;
    await setPersonalVideoPriority(ownerId, playlistId, video.id, p);
    setVideo((v) => (v ? { ...v, priority: p } : v));
  }

  async function handleToggleWatched() {
    if (!ownerId || !video) return;
    const nextVal = video.status !== "completed";
    await setPersonalVideoWatched(ownerId, playlistId, video.id, nextVal);
    setVideo((v) => (v ? { ...v, status: nextVal ? "completed" : "not_started", watchedPercentage: nextVal ? 100 : 0 } : v));
  }

  React.useEffect(() => {
    if (!user || !video || isViewingOther) return;
    void listBookmarks(user.uid, video.id).then((items) => setBookmarks(items)).catch(() => setBookmarks([]));
  }, [user, video, isViewingOther]);

  if (loading || !video) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={backToPlaylistHref} className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Playlist
            </Link>
          </Button>

          {playlistVideos.length > 0 && (
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setPlaylistVisible((v) => !v)}>
              {playlistVisible ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              {playlistVisible ? "Hide playlist" : "Show playlist"}
            </Button>
          )}
        </div>

        <div className={showPlaylistSidebar && sidebarOnRight ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]" : "space-y-5"}>
          <div className="space-y-5">
            <div className="mx-auto w-full max-w-5xl">
              <VideoPlayer
                youtubeVideoId={video.youtubeVideoId}
                videoUrl={video.videoUrl}
                startSeconds={video.status === "completed" ? 0 : video.currentPositionSeconds || 0}
                autoPlay={autoPlayRequested}
                className={sidebarOnRight ? "max-h-[72vh]" : undefined}
                onProgress={handleProgress}
                onPause={handleProgress}
                onEnded={handleEnded}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-accent" />
                <h1 className="font-display text-xl font-semibold">{video.title}</h1>
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{formatDuration(video.durationSeconds)}</span>
                {video.status === "completed" && (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Watched
                  </span>
                )}
                {video.status !== "completed" && video.watchedPercentage > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-amber-500">
                    <span className="h-1.5 w-10 overflow-hidden rounded-full bg-yellow-200">
                      <span className="block h-full rounded-full bg-yellow-500" style={{ width: `${Math.min(100, video.watchedPercentage)}%` }} />
                    </span>
                    {video.watchedPercentage}%
                  </span>
                )}
                <span>· Personal video{isViewingOther ? " (viewing as admin)" : ""}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={externalWatchAction.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {externalWatchAction.label}
              </a>
              <VideoActionsBar
                isFavorite={video.isFavorite}
                isWatchLater={video.isWatchLater}
                priority={video.priority}
                isCompleted={video.status === "completed"}
                hasPrevious={!!prev}
                hasNext={!!next}
                onPrevious={() => prev && router.push(`/playlists/${playlistId}/${prev.id}${suffix}`)}
                onNext={() => next && router.push(`/playlists/${playlistId}/${next.id}${suffix}`)}
                onToggleFavorite={handleToggleFavorite}
                onToggleWatchLater={handleToggleWatchLater}
                onSetPriority={handleSetPriority}
                onToggleWatched={handleToggleWatched}
              />
            </div>

            <Tabs defaultValue="summary">
              <TabsList>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
                <TabsTrigger value="quiz">Quiz</TabsTrigger>
                <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
              </TabsList>
              <TabsContent value="summary">
                {!isViewingOther && (
                  <div className="mb-2 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleGenerateSummary}
                      disabled={generatingSummary}
                    >
                      <Sparkles className="h-4 w-4" />
                      {generatingSummary ? "Generating…" : "Generate starter summary"}
                    </Button>
                  </div>
                )}
                <RichTextEditor
                  value={summary}
                  onChange={handleSummaryChange}
                  placeholder="Write your own summary…"
                  className="min-h-[140px]"
                />
                {!isViewingOther && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    AI uses available YouTube captions to draft a summary, key points, and topics.
                  </p>
                )}
              </TabsContent>
              <TabsContent value="notes">
                <div className="space-y-3">
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Take notes while you watch…"
                    className="min-h-[140px]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handleSaveNote} size="sm">{note.trim() ? "Save note" : "Clear note"}</Button>
                    <Button variant="outline" size="sm" onClick={handleDeleteNote} disabled={!note.trim()}>Delete note</Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Private to this user. Hidden from any shared or public playlist/video views.</p>
                </div>
              </TabsContent>

              <TabsContent value="quiz" className="space-y-4">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={handleGenerateQuiz} disabled={quizLoading}>
                    {quizLoading ? "Generating…" : quizQuestions.length ? "Generate a new quiz" : "Generate quiz"}
                  </Button>
                </div>

                {quizQuestions.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                    No quiz generated yet. Generate one from this video to test your understanding.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {quizQuestions.map((question, index) => {
                      const selected = selectedAnswers[question.id];
                      return (
                        <div key={question.id} className="rounded-lg border border-border p-4">
                          <p className="mb-3 font-medium">{index + 1}. {question.prompt}</p>
                          <div className="space-y-2">
                            {question.options.map((option) => {
                              const isCorrect = option.id === question.correctOptionId;
                              const isSelected = selected === option.id;
                              const showCorrect = quizSubmitted && isCorrect;
                              const showWrong = quizSubmitted && isSelected && !isCorrect;
                              return (
                                <label
                                  key={option.id}
                                  className={[
                                    "flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition",
                                    showCorrect ? "border-emerald-500 bg-emerald-50 text-emerald-900" : "",
                                    showWrong ? "border-red-500 bg-red-50 text-red-900" : "",
                                    !quizSubmitted && isSelected ? "border-primary bg-accent/5" : "border-border",
                                  ].join(" ")}
                                >
                                  <input
                                    type="radio"
                                    name={question.id}
                                    checked={selected === option.id}
                                    onChange={() => setSelectedAnswers((current) => ({ ...current, [question.id]: option.id }))}
                                    disabled={quizSubmitted}
                                    className="mt-1"
                                  />
                                  <span>{option.text}</span>
                                </label>
                              );
                            })}
                          </div>
                          {quizSubmitted && (
                            <p className="mt-3 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">Explanation:</span> {question.explanation}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {!quizSubmitted ? (
                      <Button onClick={handleQuizSubmit} className="w-full sm:w-auto">Submit quiz</Button>
                    ) : quizResult ? (
                      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                        Result: {quizResult.score} / {quizResult.total} correct
                      </div>
                    ) : null}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bookmarks" className="space-y-3">
                <div className="flex gap-2">
                  <Input value={bookmarkTime} onChange={(e) => setBookmarkTime(e.target.value)} placeholder="mm:ss (optional)" className="w-32" />
                  <Input value={bookmarkLabel} onChange={(e) => setBookmarkLabel(e.target.value)} placeholder="What's here?" className="flex-1" />
                  <Button onClick={handleAddBookmark}>Add</Button>
                </div>
                <div className="space-y-1.5">
                  {bookmarks.length === 0 && <p className="text-sm text-muted-foreground">No bookmarks yet.</p>}
                  {bookmarks.map((b) => (
                    <div key={b.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <Badge variant="secondary" className="font-mono">{formatDuration(b.timestampSeconds)}</Badge>
                      <span className="flex-1 text-sm">{b.label}</span>
                      <Button variant="ghost" size="icon" onClick={async () => {
                        if (!user) return;
                        await removeBookmark(user.uid, video.id, b.id);
                        setBookmarks(await listBookmarks(user.uid, video.id));
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {showPlaylistSidebar && (
            <PlaylistSidebar
              videos={playlistVideos}
              currentVideoId={video.id}
              playlistId={playlistId}
              ownerId={ownerId}
              title={playlistTitle}
              className={sidebarOnRight ? "xl:sticky xl:top-4" : "w-full"}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}

function parseTimeToSeconds(input: string): number | null {
  if (!input.trim()) return null;
  const parts = input.split(":").map((part) => parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
