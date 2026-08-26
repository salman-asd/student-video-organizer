"use client";

import * as React from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { VideoActionsBar } from "@/components/video/VideoActionsBar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getPlaylist, listVideos } from "@/lib/firestore/playlists";
import { getUserVideoState, saveProgress, setPriority, setWatchedStatus, toggleFavorite, toggleWatchLater } from "@/lib/firestore/userVideoState";
import { getNote, getSummary, saveNote, saveSummary } from "@/lib/firestore/notes";
import { addBookmark, listBookmarks, removeBookmark } from "@/lib/firestore/bookmarks";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { formatDuration } from "@/lib/utils";
import type { Bookmark, PriorityLevel, UserVideoState, Video } from "@/types";
import { Bookmark as BookmarkIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function VideoPage() {
  return (
    <RequireAuth>
      <VideoPageContent />
    </RequireAuth>
  );
}

function VideoPageContent() {
  const { videoId } = useParams<{ videoId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get("playlist") || "";
  const { user } = useAuth();

  const [playlistVideos, setPlaylistVideos] = React.useState<Video[]>([]);
  const [video, setVideo] = React.useState<Video | null>(null);
  const [state, setState] = React.useState<UserVideoState | null>(null);
  const [note, setNote] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [bookmarks, setBookmarks] = React.useState<Bookmark[]>([]);
  const [bookmarkLabel, setBookmarkLabel] = React.useState("");
  const [bookmarkTime, setBookmarkTime] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user || !playlistId) return;
    setLoading(true);
    const [vids, s, n, sm, bm] = await Promise.all([
      listVideos(playlistId),
      getUserVideoState(user.uid, videoId),
      getNote(user.uid, videoId),
      getSummary(user.uid, videoId),
      listBookmarks(user.uid, videoId),
    ]);
    setPlaylistVideos(vids);
    setVideo(vids.find((v) => v.id === videoId) || null);
    setState(s);
    setNote(n?.content || "");
    setSummary(sm?.content || "");
    setBookmarks(bm);
    setLoading(false);
  }, [user, playlistId, videoId]);

  React.useEffect(() => { load(); }, [load]);

  const debouncedSaveNote = useDebouncedCallback((val: string) => {
    if (user) saveNote(user.uid, videoId, val);
  }, 900);
  const debouncedSaveSummary = useDebouncedCallback((val: string) => {
    if (user) saveSummary(user.uid, videoId, val);
  }, 900);

  const index = playlistVideos.findIndex((v) => v.id === videoId);
  const prev = index > 0 ? playlistVideos[index - 1] : null;
  const next = index >= 0 && index < playlistVideos.length - 1 ? playlistVideos[index + 1] : null;

  async function handleProgress(cur: number, dur: number) {
    if (!user || !video) return;
    const pct = dur > 0 ? (cur / dur) * 100 : 0;
    await saveProgress(user.uid, video.id, video.playlistId, cur, pct);
    setState((s) => ({ ...(s as UserVideoState), currentPositionSeconds: cur, watchedPercentage: Math.round(pct) }));
  }

  async function handleEnded(dur: number) {
    if (!user || !video) return;
    await saveProgress(user.uid, video.id, video.playlistId, dur, 100);
    setState((s) => ({ ...(s as UserVideoState), status: "completed", watchedPercentage: 100 }));
    toast.success("Nice work — video completed!");
  }

  async function handleToggleFavorite() {
    if (!user || !video) return;
    const nextVal = !state?.isFavorite;
    await toggleFavorite(user.uid, video.id, video.playlistId, nextVal);
    setState((s) => ({ ...(s as UserVideoState), isFavorite: nextVal }));
  }

  async function handleToggleWatchLater() {
    if (!user || !video) return;
    const nextVal = !state?.isWatchLater;
    await toggleWatchLater(user.uid, video.id, video.playlistId, nextVal);
    setState((s) => ({ ...(s as UserVideoState), isWatchLater: nextVal }));
    toast.success(nextVal ? "Added to Watch Later" : "Removed from Watch Later");
  }

  async function handleSetPriority(p: PriorityLevel) {
    if (!user || !video) return;
    await setPriority(user.uid, video.id, video.playlistId, p);
    setState((s) => ({ ...(s as UserVideoState), priority: p }));
  }

  async function handleToggleWatched() {
    if (!user || !video) return;
    const nextVal = state?.status !== "completed";
    await setWatchedStatus(user.uid, video.id, video.playlistId, nextVal);
    setState((s) => ({ ...(s as UserVideoState), status: nextVal ? "completed" : "not_started", watchedPercentage: nextVal ? 100 : 0 }));
  }

  async function handleAddBookmark() {
    if (!user || !video || !bookmarkLabel.trim()) return;
    const seconds = parseTimeToSeconds(bookmarkTime) ?? Math.round(state?.currentPositionSeconds || 0);
    await addBookmark(user.uid, video.id, seconds, bookmarkLabel.trim());
    setBookmarkLabel("");
    setBookmarkTime("");
    setBookmarks(await listBookmarks(user.uid, video.id));
  }

  if (loading || !video) {
    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-10 w-full" />
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
          startSeconds={state?.currentPositionSeconds || 0}
          onProgress={handleProgress}
          onPause={handleProgress}
          onEnded={handleEnded}
        />

        <div>
          <h1 className="font-display text-xl font-semibold">{video.title}</h1>
          <p className="text-sm text-muted-foreground">{formatDuration(video.durationSeconds)}</p>
        </div>

        <div className="space-y-1.5">
          <Progress value={state?.watchedPercentage || 0} />
          <p className="text-xs text-muted-foreground">{state?.watchedPercentage || 0}% watched</p>
        </div>

        <VideoActionsBar
          isFavorite={!!state?.isFavorite}
          isWatchLater={!!state?.isWatchLater}
          priority={state?.priority || null}
          isCompleted={state?.status === "completed"}
          hasPrevious={!!prev}
          hasNext={!!next}
          onPrevious={() => prev && router.push(`/video/${prev.id}?playlist=${playlistId}`)}
          onNext={() => next && router.push(`/video/${next.id}?playlist=${playlistId}`)}
          onToggleFavorite={handleToggleFavorite}
          onToggleWatchLater={handleToggleWatchLater}
          onSetPriority={handleSetPriority}
          onToggleWatched={handleToggleWatched}
        />

        <Tabs defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <Textarea
              value={summary}
              onChange={(e) => { setSummary(e.target.value); debouncedSaveSummary(e.target.value); }}
              placeholder="Write your own summary of this video's key ideas…"
              className="min-h-[140px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">Autosaves as you type. Only visible to you (and admins).</p>
          </TabsContent>

          <TabsContent value="notes">
            <Textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); debouncedSaveNote(e.target.value); }}
              placeholder="Take notes while you watch…"
              className="min-h-[140px]"
            />
            <p className="mt-1 text-xs text-muted-foreground">Private to you — other students can't see this.</p>
          </TabsContent>

          <TabsContent value="bookmarks" className="space-y-3">
            <div className="flex gap-2">
              <Input value={bookmarkTime} onChange={(e) => setBookmarkTime(e.target.value)} placeholder="mm:ss (optional)" className="w-32" />
              <Input value={bookmarkLabel} onChange={(e) => setBookmarkLabel(e.target.value)} placeholder="What's here?" className="flex-1" />
              <Button onClick={handleAddBookmark}><BookmarkIcon className="h-4 w-4" /> Add</Button>
            </div>
            <div className="space-y-1.5">
              {bookmarks.length === 0 && <p className="text-sm text-muted-foreground">No bookmarks yet.</p>}
              {bookmarks.map((b) => (
                <div key={b.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <Badge variant="secondary" className="font-mono">{formatDuration(b.timestampSeconds)}</Badge>
                  <span className="flex-1 text-sm">{b.label}</span>
                  <Button variant="ghost" size="icon" onClick={async () => { await removeBookmark(user!.uid, video.id, b.id); setBookmarks(await listBookmarks(user!.uid, video.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

function parseTimeToSeconds(input: string): number | null {
  if (!input.trim()) return null;
  const parts = input.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
