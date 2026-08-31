"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addGoal, listGoals, removeGoal, toggleGoal, updateGoal, type GoalInput } from "@/lib/firestore/goals";
import { listPersonalPlaylists, listAllPersonalVideos } from "@/lib/firestore/personalPlaylists";
import {
  describeDueDate, isGoalOverdue, getGoalLinkedPlaylists, getGoalLinkedVideos, calculateGoalProgress,
} from "@/lib/goalUtils";
import { todayKey } from "@/lib/utils";
import type { Goal, PersonalPlaylist, PersonalVideo, PriorityLevel } from "@/types";
import {
  Target, Trash2, Pencil, Plus, ListVideo, CalendarClock, CheckCircle2, Flag, Search, X, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

type FilterTab = "all" | "active" | "completed" | "overdue";
type SortMode = "dueDate" | "priority" | "newest" | "oldest" | "alphabetical";
type PriorityFormValue = "none" | "high" | "medium" | "low";
type AllPersonalVideo = PersonalVideo & { playlistTitle: string };

const FILTER_LABELS: Record<FilterTab, string> = {
  all: "All",
  active: "Active",
  completed: "Completed",
  overdue: "Overdue",
};

const SORT_LABELS: Record<SortMode, string> = {
  dueDate: "Due date",
  priority: "Priority",
  newest: "Newest first",
  oldest: "Oldest first",
  alphabetical: "A–Z",
};

const PRIORITY_RANK: Record<PriorityFormValue, number> = { high: 3, medium: 2, low: 1, none: 0 };

const emptyForm = {
  title: "",
  notes: "",
  targetDate: "",
  priority: "none" as PriorityFormValue,
  linkedPlaylistIds: [] as string[],
  linkedVideoIds: [] as string[],
};

export default function GoalsPage() {
  return (
    <RequireAuth>
      <GoalsContent />
    </RequireAuth>
  );
}

function GoalsContent() {
  const { user } = useAuth();
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);
  // Every personal video across every playlist, fetched once. Goal progress
  // for *any* combination of linked playlists/videos is then just a filter
  // over this single list (see calculateGoalProgress) — far cheaper than
  // fetching per-goal, per-linked-playlist, and it's what makes de-duping
  // a video that's both individually linked and inside a linked playlist
  // basically free (it can only appear once in this array to begin with).
  const [allVideos, setAllVideos] = React.useState<AllPersonalVideo[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [filterTab, setFilterTab] = React.useState<FilterTab>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("dueDate");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [videoSearch, setVideoSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [gs, pls, vids] = await Promise.all([
      listGoals(user.uid),
      listPersonalPlaylists(user.uid),
      listAllPersonalVideos(user.uid),
    ]);
    setGoals(gs);
    setPlaylists(pls);
    setAllVideos(vids);
    setLoading(false);
  }, [user]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const today = todayKey();

  const stats = React.useMemo(() => ({
    total: goals.length,
    active: goals.filter((g) => !g.completed).length,
    completed: goals.filter((g) => g.completed).length,
    overdue: goals.filter((g) => isGoalOverdue(g)).length,
  }), [goals]);

  const visibleGoals = React.useMemo(() => {
    let list = [...goals];
    if (filterTab === "active") list = list.filter((g) => !g.completed);
    else if (filterTab === "completed") list = list.filter((g) => g.completed);
    else if (filterTab === "overdue") list = list.filter((g) => isGoalOverdue(g));

    list.sort((a, b) => {
      if (sortMode === "alphabetical") return a.title.localeCompare(b.title);
      if (sortMode === "priority") {
        const rank = (g: Goal) => PRIORITY_RANK[(g.priority || "none") as PriorityFormValue];
        return rank(b) - rank(a);
      }
      if (sortMode === "newest") return tsMillis(b.createdAt) - tsMillis(a.createdAt);
      if (sortMode === "oldest") return tsMillis(a.createdAt) - tsMillis(b.createdAt);
      // dueDate: goals with a target date first (soonest first), undated goals last, newest-first within that group
      if (a.targetDate && b.targetDate) return a.targetDate.localeCompare(b.targetDate);
      if (a.targetDate) return -1;
      if (b.targetDate) return 1;
      return tsMillis(b.createdAt) - tsMillis(a.createdAt);
    });
    return list;
  }, [goals, filterTab, sortMode]);

  function openAddDialog() {
    setEditingGoal(null);
    setForm(emptyForm);
    setVideoSearch("");
    setDialogOpen(true);
  }

  function openEditDialog(goal: Goal) {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      notes: goal.notes || "",
      targetDate: goal.targetDate || "",
      priority: (goal.priority || "none") as PriorityFormValue,
      linkedPlaylistIds: getGoalLinkedPlaylists(goal).map((p) => p.id),
      linkedVideoIds: getGoalLinkedVideos(goal).map((v) => v.id),
    });
    setVideoSearch("");
    setDialogOpen(true);
  }

  function toggleFormPlaylist(playlistId: string) {
    setForm((f) => ({
      ...f,
      linkedPlaylistIds: f.linkedPlaylistIds.includes(playlistId)
        ? f.linkedPlaylistIds.filter((id) => id !== playlistId)
        : [...f.linkedPlaylistIds, playlistId],
    }));
  }

  function toggleFormVideo(videoId: string) {
    setForm((f) => ({
      ...f,
      linkedVideoIds: f.linkedVideoIds.includes(videoId)
        ? f.linkedVideoIds.filter((id) => id !== videoId)
        : [...f.linkedVideoIds, videoId],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      const linkedPlaylists = form.linkedPlaylistIds
        .map((id) => playlists.find((p) => p.id === id))
        .filter((p): p is PersonalPlaylist => !!p)
        .map((p) => ({ id: p.id, title: p.title }));

      const linkedVideos = form.linkedVideoIds
        .map((id) => allVideos.find((v) => v.id === id))
        .filter((v): v is AllPersonalVideo => !!v)
        .map((v) => ({ id: v.id, playlistId: v.playlistId, playlistTitle: v.playlistTitle, title: v.title }));

      const input: GoalInput = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        targetDate: form.targetDate || null,
        priority: (form.priority === "none" ? null : form.priority) as PriorityLevel,
        linkedPlaylists,
        linkedVideos,
      };

      if (editingGoal) {
        await updateGoal(user.uid, editingGoal.id, input);
        toast.success("Goal updated");
      } else {
        await addGoal(user.uid, input);
        toast.success("Goal added");
      }
      setDialogOpen(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(goal: Goal, completed: boolean) {
    if (!user) return;
    setGoals((current) => current.map((g) => (g.id === goal.id ? { ...g, completed } : g)));
    await toggleGoal(user.uid, goal.id, completed);
    if (completed) toast.success("Nice work! Goal marked complete.");
  }

  async function handleDelete(goal: Goal) {
    if (!user) return;
    if (!confirm(`Delete the goal "${goal.title}"?`)) return;
    await removeGoal(user.uid, goal.id);
    toast.success("Goal deleted");
    refresh();
  }

  const filteredVideoOptions = React.useMemo(() => {
    const q = videoSearch.trim().toLowerCase();
    const base = q ? allVideos.filter((v) => v.title.toLowerCase().includes(q)) : allVideos;
    // Cap the rendered list — with hundreds/thousands of personal videos,
    // rendering every match at once isn't necessary; typing narrows it down.
    return base.slice(0, 60);
  }, [allVideos, videoSearch]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Learning Goals</h1>
            <p className="text-sm text-muted-foreground">Set intentions, track deadlines, and link goals to playlists or individual videos to watch progress add up automatically.</p>
          </div>
          <Button onClick={openAddDialog}><Plus className="h-4 w-4" /> Add Goal</Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Target} label="Total" value={stats.total} loading={loading} />
          <StatTile icon={Flag} label="Active" value={stats.active} loading={loading} />
          <StatTile icon={CheckCircle2} label="Completed" value={stats.completed} loading={loading} />
          <StatTile icon={CalendarClock} label="Overdue" value={stats.overdue} loading={loading} tone={stats.overdue > 0 ? "danger" : undefined} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)}>
            <TabsList>
              {(Object.keys(FILTER_LABELS) as FilterTab[]).map((tab) => (
                <TabsTrigger key={tab} value={tab}>{FILTER_LABELS[tab]}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Sort</Label>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>{SORT_LABELS[mode]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)
          ) : visibleGoals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              {filterTab === "all"
                ? "No goals yet. Add your first one above."
                : `No ${FILTER_LABELS[filterTab].toLowerCase()} goals.`}
            </p>
          ) : (
            visibleGoals.map((g) => {
              const due = describeDueDate(g.targetDate, g.completed, new Date(`${today}T12:00:00`));
              const linkedPlaylists = getGoalLinkedPlaylists(g);
              const linkedVideos = getGoalLinkedVideos(g);
              const progress = calculateGoalProgress(g, allVideos);
              const progressPercent = progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;
              const hasLinkedContent = linkedPlaylists.length > 0 || linkedVideos.length > 0;

              return (
                <Card key={g.id} className={g.completed ? "opacity-70" : ""}>
                  <CardContent className="space-y-2.5 p-3.5">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-0.5"
                        checked={g.completed}
                        onCheckedChange={(v) => handleToggle(g, !!v)}
                        aria-label={`Mark "${g.title}" ${g.completed ? "incomplete" : "complete"}`}
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={g.completed ? "text-sm text-muted-foreground line-through" : "text-sm font-medium"}>{g.title}</span>
                          {g.priority && (
                            <Badge variant={g.priority === "high" ? "priorityHigh" : g.priority === "medium" ? "priorityMedium" : "priorityLow"}>
                              {g.priority}
                            </Badge>
                          )}
                          {due.label && (
                            <Badge variant={due.status === "overdue" ? "destructive" : due.status === "today" || due.status === "soon" ? "accent" : "outline"}>
                              {due.label}
                            </Badge>
                          )}
                        </div>
                        {g.notes && <p className="text-xs text-muted-foreground">{g.notes}</p>}

                        {hasLinkedContent && (
                          <div className="space-y-1.5 pt-1">
                            {linkedPlaylists.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ListVideo className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                {linkedPlaylists.map((p) => (
                                  <Link key={p.id} href={`/my-playlists/${p.id}`}>
                                    <Badge variant="outline" className="font-normal hover:bg-secondary">{p.title}</Badge>
                                  </Link>
                                ))}
                              </div>
                            )}
                            {linkedVideos.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <PlayCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                {linkedVideos.map((v) => (
                                  <Link key={v.id} href={`/my-playlists/${v.playlistId}/${v.id}`}>
                                    <Badge variant="outline" className="font-normal hover:bg-secondary">{v.title}</Badge>
                                  </Link>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{progress.watched} of {progress.total} watched ({progressPercent}%)</span>
                            </div>
                            <Progress value={progressPercent} className="h-1.5" />
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(g)} aria-label="Edit goal"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(g)} aria-label="Delete goal"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingGoal ? "Edit Goal" : "Add Goal"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Learn English"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Why this matters, or what 'done' looks like"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due date (optional)</Label>
                <Input
                  type="date"
                  value={form.targetDate}
                  onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as PriorityFormValue }))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Playlists ({form.linkedPlaylistIds.length} selected)</Label>
              {playlists.length === 0 ? (
                <p className="text-xs text-muted-foreground">You don&apos;t have any personal playlists yet.</p>
              ) : (
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-input p-1.5">
                  {playlists.map((p) => (
                    <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                      <Checkbox checked={form.linkedPlaylistIds.includes(p.id)} onCheckedChange={() => toggleFormPlaylist(p.id)} />
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.videoCount} videos</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Individual videos ({form.linkedVideoIds.length} selected)</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={videoSearch}
                  onChange={(e) => setVideoSearch(e.target.value)}
                  placeholder="Search your videos by title"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              {form.linkedVideoIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {form.linkedVideoIds.map((id) => {
                    const v = allVideos.find((video) => video.id === id);
                    if (!v) return null;
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1 font-normal">
                        <span className="max-w-[160px] truncate">{v.title}</span>
                        <button type="button" onClick={() => toggleFormVideo(id)} aria-label={`Remove ${v.title}`} className="rounded-full p-0.5 hover:bg-background/60">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-md border border-input p-1.5">
                {filteredVideoOptions.length === 0 ? (
                  <p className="px-1.5 py-2 text-xs text-muted-foreground">
                    {videoSearch ? "No videos match that search." : "You don't have any personal videos yet."}
                  </p>
                ) : (
                  filteredVideoOptions.map((v) => (
                    <label key={v.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-secondary">
                      <Checkbox checked={form.linkedVideoIds.includes(v.id)} onCheckedChange={() => toggleFormVideo(v.id)} />
                      <span className="min-w-0 flex-1 truncate">{v.title}</span>
                      <span className="shrink-0 truncate text-xs text-muted-foreground">{v.playlistTitle}</span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                A video counted through a linked playlist above won&apos;t be counted twice even if you also pick it here.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.title.trim()}>{saving ? "Saving…" : editingGoal ? "Save changes" : "Add Goal"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  loading,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  loading: boolean;
  tone?: "danger";
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 px-3 py-3 shadow-sm">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === "danger" ? "bg-destructive/15" : "bg-accent/15"}`}>
        <Icon className={`h-4.5 w-4.5 ${tone === "danger" ? "text-destructive" : "text-accent"}`} />
      </span>
      <div className="min-w-0">
        {loading ? <Skeleton className="h-6 w-8" /> : <p className={`text-xl font-semibold leading-none ${tone === "danger" && value > 0 ? "text-destructive" : ""}`}>{value}</p>}
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function tsMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return 0;
}
