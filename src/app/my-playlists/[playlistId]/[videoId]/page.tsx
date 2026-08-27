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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import {
  getPersonalVideo, listPersonalVideos, savePersonalVideoProgress, setPersonalVideoPriority,
  setPersonalVideoWatched, togglePersonalVideoFavorite, togglePersonalVideoWatchLater,
} from "@/lib/firestore/personalPlaylists";
import { getNote, getSummary, saveNote, saveSummary } from "@/lib/firestore/notes";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { formatDuration } from "@/lib/utils";
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
  const [note, setNote] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [v, vids, n, sm] = await Promise.all([
      getPersonalVideo(ownerId, playlistId, videoId),
      listPersonalVideos(ownerId, playlistId),
      getNote(ownerId, noteKey(videoId)),
      getSummary(ownerId, noteKey(videoId)),
    ]);
    setVideo(v);
    setPlaylistVideos(vids);
    setNote(n?.content || "");
    setSummary(sm?.content || "");
    setLoading(false);
  }, [ownerId, playlistId, videoId]);

  React.useEffect(() => { load(); }, [load]);

  const debouncedSaveNote = useDebouncedCallback((val: string) => {
    if (ownerId) saveNote(ownerId, noteKey(videoId), val);
  }, 900);
  const debouncedSaveSummary = useDebouncedCallback((val: string) => {
    if (ownerId) saveSummary(ownerId, noteKey(videoId), val);
  }, 900);

  const index = playlistVideos.findIndex((v) => v.id === videoId);
  const prev = index > 0 ? playlistVideos[index - 1] : null;
  const next = index >= 0 && index < playlistVideos.length - 1 ? playlistVideos[index + 1] : null;
  const suffix = isViewingOther ? `?owner=${ownerId}` : "";

  async function handleProgress(cur: number, dur: number) {
    if (!ownerId || !video) return;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    await savePersonalVideoProgress(ownerId, playlistId, video.id, cur, pct);
    setVideo((v) => (v ? { ...v, currentPositionSeconds: cur, watchedPercentage: Math.round(pct) } : v));
  }

  async function handleEnded(dur: number) {
    if (!ownerId || !video) return;
    await savePersonalVideoProgress(ownerId, playlistId, video.id, dur, 100);
    setVideo((v) => (v ? { ...v, status: "completed", watchedPercentage: 100 } : v));
    toast.success("Nice work — video completed!");
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
            <Textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); debouncedSaveNote(e.target.value); }}
              placeholder="Take notes while you watch…"
              className="min-h-[140px]"
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
