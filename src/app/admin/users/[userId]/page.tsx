"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VideoListRow } from "@/components/video/VideoListRow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getUserProfile, recomputeUserStats, setUserStatus } from "@/lib/firestore/users";
import { listPlaylists, listVideos } from "@/lib/firestore/playlists";
import { listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import {
  getAllUserVideoStates, setPriority, setWatchedStatus, toggleFavorite, toggleWatchLater,
} from "@/lib/firestore/userVideoState";
import { getNote, getSummary } from "@/lib/firestore/notes";
import { listGoals, toggleGoal } from "@/lib/firestore/goals";
import { getGoalLinkedPlaylists, getGoalLinkedVideos } from "@/lib/goalUtils";
import { formatWatchTime } from "@/lib/utils";
import type { Goal, PersonalPlaylist, Playlist, UserProfile, VideoWithState } from "@/types";
import { ArrowLeft, Flame, ShieldOff, ShieldCheck as ShieldCheckIcon, StickyNote, Lock, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AiQuota } from "@/lib/server/aiQuota";

export default function AdminUserDetailPage() {
  return (
    <RequireAdmin>
      <AdminUserDetailContent />
    </RequireAdmin>
  );
}

function AdminUserDetailContent() {
  const { userId } = useParams<{ userId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [quota, setQuota] = React.useState<AiQuota | null>(null);
  const [quotaSaving, setQuotaSaving] = React.useState(false);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [videos, setVideos] = React.useState<VideoWithState[]>([]);
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [personalPlaylists, setPersonalPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [noteDialogVideo, setNoteDialogVideo] = React.useState<VideoWithState | null>(null);
  const [noteContent, setNoteContent] = React.useState("");
  const [summaryContent, setSummaryContent] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [p, pls, states, gs, personalPls] = await Promise.all([
      getUserProfile(userId),
      listPlaylists(false),
      getAllUserVideoStates(userId),
      listGoals(userId),
      listPersonalPlaylists(userId),
    ]);
    setProfile(p);
    setPlaylists(pls);
    setGoals(gs);
    setPersonalPlaylists(personalPls);
    if (user) {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/ai/quota?uid=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setQuota(data.quota ?? null);
      } catch {
        setQuota(null);
      }
    }
    const allVideos: VideoWithState[] = [];
    for (const pl of pls) {
      const vids = await listVideos(pl.id);
      vids.forEach((v) => allVideos.push({ ...v, state: states[v.id] || null, playlistTitle: pl.title }));
    }
    setVideos(allVideos);
    setLoading(false);
  }, [user, userId]);

  React.useEffect(() => { load(); }, [load]);

  async function handleQuotaSave(next: Partial<AiQuota>) {
    if (!user || !userId || !quota) return;
    setQuotaSaving(true);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/quota", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ uid: userId, ...next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to update quota.");
      setQuota(data.quota ?? { ...quota, ...next });
      toast.success("AI access updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update AI access.");
    } finally {
      setQuotaSaving(false);
    }
  }

  async function openNoteDialog(v: VideoWithState) {
    const [n, s] = await Promise.all([getNote(userId, v.id), getSummary(userId, v.id)]);
    setNoteContent(n?.content || "");
    setSummaryContent(s?.content || "");
    setNoteDialogVideo(v);
  }

  async function handleToggleStatus() {
    if (!profile) return;
    const next = profile.status === "active" ? "disabled" : "active";
    await setUserStatus(profile.uid, next);
    setProfile({ ...profile, status: next });
    toast.success(next === "active" ? "Access re-enabled" : "Access disabled");
  }

  async function handleRefreshStats() {
    if (!profile) return;
    const stats = await recomputeUserStats(profile.uid);
    setProfile({ ...profile, stats });
    toast.success("Stats refreshed");
  }

  const favorites = videos.filter((v) => v.state?.isFavorite);
  const watchLater = videos.filter((v) => v.state?.isWatchLater).sort((a, b) => (a.state?.watchLaterOrder || 0) - (b.state?.watchLaterOrder || 0));
  const priority = videos.filter((v) => v.state?.priority);
  const history = videos.filter((v) => v.state?.lastWatchedAt).sort((a, b) => tsMillis(b.state?.lastWatchedAt) - tsMillis(a.state?.lastWatchedAt));
  const notesVideos = videos; // admin can open any video's notes

  if (loading || !profile) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12"><AvatarFallback>{profile.displayName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <div>
              <h1 className="font-display text-xl font-semibold">{profile.displayName}</h1>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
            </div>
            <Badge variant={profile.status === "active" ? "success" : "destructive"}>{profile.status}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshStats}>Refresh stats</Button>
            <Button variant={profile.status === "active" ? "destructive" : "default"} size="sm" onClick={handleToggleStatus}>
              {profile.status === "active" ? <><ShieldOff className="h-4 w-4" /> Disable access</> : <><ShieldCheckIcon className="h-4 w-4" /> Enable access</>}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-5 w-5 text-accent" />
                <div>
                  <h2 className="font-display text-base font-semibold">AI Access</h2>
                  <p className="text-sm text-muted-foreground">Manage this student’s system AI fallback and daily allowance.</p>
                </div>
              </div>
              <button
                type="button"
                className="relative inline-flex h-6 w-11 items-center rounded-full border border-border bg-secondary transition-colors data-[on=true]:bg-primary"
                data-on={Boolean(quota?.systemAiEnabled)}
                onClick={() => quota && handleQuotaSave({ systemAiEnabled: !quota.systemAiEnabled })}
                disabled={quotaSaving || !quota}
                aria-label="Toggle system AI access"
              >
                <span className={"inline-block h-5 w-5 rounded-full bg-white transition-transform " + (quota?.systemAiEnabled ? "translate-x-5" : "translate-x-1")} />
              </button>
            </div>

            {quota ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Daily limit</p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={quota.dailyLimit}
                      onChange={(e) => setQuota({ ...quota, dailyLimit: Number(e.target.value) || 0 })}
                      onBlur={() => handleQuotaSave({ dailyLimit: quota.dailyLimit })}
                      className="w-28 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">/ day</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Today</p>
                  <p className="mt-1 text-lg font-semibold">{quota.usedToday}/{quota.dailyLimit}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Quota data isn’t available yet.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Videos" value={profile.stats?.totalVideos ?? videos.length} />
          <StatCard label="Completed" value={profile.stats?.completed ?? "—"} />
          <StatCard label="In Progress" value={profile.stats?.inProgress ?? "—"} />
          <StatCard label="Favorites" value={favorites.length} />
          <StatCard label="Watch Later" value={watchLater.length} />
          <StatCard label="Priority" value={priority.length} />
        </div>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span>Learning time: {profile.stats ? formatWatchTime(profile.stats.totalWatchTimeSeconds) : "—"}</span>
          <span className="flex items-center gap-1"><Flame className="h-3.5 w-3.5 text-accent" /> {profile.stats?.currentStreakDays ?? 0} day streak</span>
        </div>

        <Tabs defaultValue="playlists">
          <TabsList className="flex-wrap">
            <TabsTrigger value="playlists">Playlists</TabsTrigger>
            <TabsTrigger value="personal">Personal Playlists</TabsTrigger>
            <TabsTrigger value="watchlater">Watch Later</TabsTrigger>
            <TabsTrigger value="priority">Priority</TabsTrigger>
            <TabsTrigger value="favorites">Favorites</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>

          <TabsContent value="playlists" className="space-y-2">
            {playlists.map((p) => {
              const count = videos.filter((v) => v.playlistId === p.id).length;
              const completed = videos.filter((v) => v.playlistId === p.id && v.state?.status === "completed").length;
              return (
                <Link key={p.id} href={`/admin/playlists/${p.id}?student=${userId}`}>
                  <Card className="transition-colors hover:bg-secondary/40">
                    <CardContent className="flex items-center justify-between p-3">
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-xs text-muted-foreground">{count} videos</p>
                      </div>
                      <Badge variant="secondary">{completed}/{count} completed</Badge>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </TabsContent>

          <TabsContent value="personal" className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Playlists this student created for themselves — private to them, but you can inspect and manage them here.
            </p>
            {personalPlaylists.length === 0 && <EmptyRow text="This student hasn't created any personal playlists." />}
            {personalPlaylists.map((p) => (
                <Link key={p.id} href={`/playlists/${p.id}?owner=${userId}`}>
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardContent className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{p.title}</p>
                        {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                      </div>
                    </div>
                    <Badge variant="secondary">{p.videoCount} videos</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </TabsContent>

          <TabsContent value="watchlater" className="space-y-2">
            {watchLater.length === 0 && <EmptyRow text="Nothing in Watch Later." />}
            {watchLater.map((v) => (
              <VideoListRow
                key={v.id}
                video={v}
                onMarkWatched={async () => { await setWatchedStatus(userId, v.id, v.playlistId, v.state?.status !== "completed"); load(); }}
                onRemove={async () => { await toggleWatchLater(userId, v.id, v.playlistId, false); load(); }}
                onSetPriority={async (p) => { await setPriority(userId, v.id, v.playlistId, p); load(); }}
              />
            ))}
          </TabsContent>

          <TabsContent value="priority" className="space-y-2">
            {priority.length === 0 && <EmptyRow text="No priority videos set." />}
            {priority.map((v) => (
              <VideoListRow
                key={v.id}
                video={v}
                onMarkWatched={async () => { await setWatchedStatus(userId, v.id, v.playlistId, v.state?.status !== "completed"); load(); }}
                onSetPriority={async (p) => { await setPriority(userId, v.id, v.playlistId, p); load(); }}
              />
            ))}
          </TabsContent>

          <TabsContent value="favorites" className="space-y-2">
            {favorites.length === 0 && <EmptyRow text="No favorites yet." />}
            {favorites.map((v) => (
              <VideoListRow
                key={v.id}
                video={v}
                onToggleFavorite={async () => { await toggleFavorite(userId, v.id, v.playlistId, false); load(); }}
              />
            ))}
          </TabsContent>

          <TabsContent value="notes" className="space-y-2">
            <p className="text-xs text-muted-foreground">Click any video to view or edit its notes and summary.</p>
            {notesVideos.map((v) => (
              <button key={v.id} onClick={() => openNoteDialog(v)} className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-left transition-colors hover:bg-secondary/40">
                <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-sm">{v.title}</span>
                <span className="text-xs text-muted-foreground">{v.playlistTitle}</span>
              </button>
            ))}
          </TabsContent>

          <TabsContent value="history" className="space-y-2">
            {history.length === 0 && <EmptyRow text="No watch history yet." />}
            {history.slice(0, 30).map((v) => <VideoListRow key={v.id} video={v} />)}
          </TabsContent>

          <TabsContent value="goals" className="space-y-2">
            {goals.length === 0 && <EmptyRow text="No goals set." />}
            {goals.map((g) => (
              <Card key={g.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={g.completed ? "text-sm text-muted-foreground line-through" : "text-sm"}>{g.title}</span>
                    {g.priority && (
                      <Badge variant={g.priority === "high" ? "priorityHigh" : g.priority === "medium" ? "priorityMedium" : "priorityLow"}>
                        {g.priority}
                      </Badge>
                    )}
                    {g.targetDate && <Badge variant="outline">Due {g.targetDate}</Badge>}
                    {getGoalLinkedPlaylists(g).map((p) => <Badge key={p.id} variant="outline">{p.title}</Badge>)}
                    {getGoalLinkedVideos(g).map((v) => <Badge key={v.id} variant="outline">{v.title}</Badge>)}
                  </div>
                  <Badge variant={g.completed ? "success" : "secondary"}>{g.completed ? "Done" : "Active"}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!noteDialogVideo} onOpenChange={(open) => !open && setNoteDialogVideo(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{noteDialogVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Summary</p>
              <Textarea value={summaryContent} readOnly className="min-h-[80px]" />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
              <Textarea value={noteContent} readOnly className="min-h-[100px]" />
            </div>
            <p className="text-xs text-muted-foreground">
              Read-only preview. Editing a student&apos;s notes directly is supported via the same Firestore
              document (users/{"{"}uid{"}"}/notes/{"{"}videoId{"}"}) — wire up a save button here if your workflow needs it.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function tsMillis(t: any): number {
  if (!t) return 0;
  if (typeof t.toMillis === "function") return t.toMillis();
  return 0;
}
