"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoActionsBar } from "@/components/video/VideoActionsBar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import {
  getPersonalPlaylist, getPersonalVideo, listPersonalVideos, savePersonalVideoProgress, setPersonalVideoPriority,
  setPersonalVideoWatched, togglePersonalVideoFavorite, togglePersonalVideoWatchLater,
} from "@/lib/firestore/personalPlaylists";
import { deleteNote, getNote, getSummary, saveNote, saveSummary } from "@/lib/firestore/notes";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { formatDuration } from "@/lib/utils";
import { calculateProgress, shouldPersistProgress } from "@/lib/watchProgress";
import { getExternalWatchAction } from "@/lib/video-platforms";
import type { PersonalVideo, PriorityLevel } from "@/types";
import { toast } from "sonner";

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

  const [video, setVideo] = React.useState<PersonalVideo | null>(null);
  const [playlistVideos, setPlaylistVideos] = React.useState<PersonalVideo[]>([]);
  const [autoPlay, setAutoPlay] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const lastProgressSaveRef = React.useRef(0);
  const previousProgressRef = React.useRef(0);

  React.useEffect(() => {
    previousProgressRef.current = video?.currentPositionSeconds || 0;
    lastProgressSaveRef.current = Date.now();
  }, [video?.currentPositionSeconds, videoId]);

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
    setNote(n?.content || "");
    setSummary(sm?.content || "");
    setAutoPlay(!!pl?.autoPlay);
    setLoading(false);
  }, [ownerId, playlistId, videoId]);

  React.useEffect(() => { load(); }, [load]);

  const debouncedSaveSummary = useDebouncedCallback((val: string) => {
    if (ownerId) saveSummary(ownerId, noteKey(videoId), val);
  }, 900);

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

  const index = playlistVideos.findIndex((v) => v.id === videoId);
  const prev = index > 0 ? playlistVideos[index - 1] : null;
  const next = index >= 0 && index < playlistVideos.length - 1 ? playlistVideos[index + 1] : null;
  const suffix = isViewingOther ? `?owner=${ownerId}` : "";
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
      status: snapshot.completed ? "completed" : (v.status === "completed" ? "completed" : (snapshot.percent > 0 ? "in_progress" : "not_started")),
    } : v));

    // Nothing worth persisting yet (player hasn't actually started).
    if (!shouldPersist || cur <= 0) return;

    await savePersonalVideoProgress(ownerId, playlistId, video.id, cur, snapshot.percent);
    lastProgressSaveRef.current = Date.now();
    previousProgressRef.current = cur;
  }

  async function handleEnded(dur: number) {
    if (!ownerId || !video) return;
    const snapshot = calculateProgress(dur, dur);
    await savePersonalVideoProgress(ownerId, playlistId, video.id, dur, 100);
    lastProgressSaveRef.current = Date.now();
    previousProgressRef.current = dur;
    setVideo((v) => (v ? { ...v, status: "completed", currentPositionSeconds: dur, watchedPercentage: snapshot.percent } : v));

    if (autoPlay && next) {
      toast.success(`Finished! Autoplaying "${next.title}"…`);
      router.push(`/my-playlists/${playlistId}/${next.id}${suffix}`);
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
      <div className="mx-auto max-w-4xl space-y-5">
        <VideoPlayer
          youtubeVideoId={video.youtubeVideoId}
          videoUrl={video.videoUrl}
          startSeconds={video.currentPositionSeconds || 0}
          onProgress={handleProgress}
          onPause={handleProgress}
          onEnded={handleEnded}
        />

        <div>
          <h1 className="font-display text-xl font-semibold flex items-center gap-2">
            <Lock className="h-4 w-4 text-accent" /> {video.title}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDuration(video.durationSeconds)} · Personal video{isViewingOther ? " (viewing as admin)" : ""}</p>
        </div>

        <div className="space-y-1.5">
          <Progress value={video.watchedPercentage} />
          <p className="text-xs text-muted-foreground">{video.watchedPercentage}% watched</p>
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
            onPrevious={() => prev && router.push(`/my-playlists/${playlistId}/${prev.id}${suffix}`)}
            onNext={() => next && router.push(`/my-playlists/${playlistId}/${next.id}${suffix}`)}
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
          </TabsList>
          <TabsContent value="summary">
            <Textarea
              value={summary}
              onChange={(e) => { setSummary(e.target.value); debouncedSaveSummary(e.target.value); }}
              placeholder="Write your own summary…"
              className="min-h-[140px]"
            />
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
        </Tabs>
      </div>
    </AppShell>
  );
}
