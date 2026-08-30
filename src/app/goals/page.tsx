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
import { listPersonalPlaylists, listPersonalVideos } from "@/lib/firestore/personalPlaylists";
import { describeDueDate, isGoalOverdue } from "@/lib/goalUtils";
import { todayKey } from "@/lib/utils";
import type { Goal, PersonalPlaylist, PriorityLevel } from "@/types";
import { Target, Trash2, Pencil, Plus, ListVideo, CalendarClock, CheckCircle2, Flag } from "lucide-react";
import { toast } from "sonner";

type FilterTab = "all" | "active" | "completed" | "overdue";
type SortMode = "dueDate" | "priority" | "newest" | "oldest" | "alphabetical";
type PriorityFormValue = "none" | "high" | "medium" | "low";

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
  linkedPlaylistId: "none",
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
  const [progressMap, setProgressMap] = React.useState<Record<string, { watched: number; total: number }>>({});
  const [loading, setLoading] = React.useState(true);

  const [filterTab, setFilterTab] = React.useState<FilterTab>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("dueDate");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingGoal, setEditingGoal] = React.useState<Goal | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [gs, pls] = await Promise.all([listGoals(user.uid), listPersonalPlaylists(user.uid)]);
    setGoals(gs);
    setPlaylists(pls);

    // Only fetch videos for playlists that a goal actually links to, and
    // only once per playlist — this page can otherwise get expensive if a
    // student has many playlists but few goals linked to them.
    const linkedIds = Array.from(new Set(gs.map((g) => g.linkedPlaylistId).filter((id): id is string => !!id)));
    const entries = await Promise.all(
      linkedIds.map(async (playlistId) => {
        const videos = await listPersonalVideos(user.uid, playlistId).catch(() => []);
        const watched = videos.filter((v) => v.status === "completed").length;
        return [playlistId, { watched, total: videos.length }] as const;
      })
    );
    setProgressMap(Object.fromEntries(entries));
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
    setDialogOpen(true);
  }

  function openEditDialog(goal: Goal) {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      notes: goal.notes || "",
      targetDate: goal.targetDate || "",
      priority: (goal.priority || "none") as PriorityFormValue,
      linkedPlaylistId: goal.linkedPlaylistId || "none",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.title.trim()) return;
    setSaving(true);
    try {
      const linkedPlaylist = form.linkedPlaylistId !== "none"
        ? playlists.find((p) => p.id === form.linkedPlaylistId)
        : undefined;

      const input: GoalInput = {
        title: form.title.trim(),
        notes: form.notes.trim(),
        targetDate: form.targetDate || null,
        priority: (form.priority === "none" ? null : form.priority) as PriorityLevel,
        linkedPlaylistId: linkedPlaylist?.id || null,
        linkedPlaylistTitle: linkedPlaylist?.title || null,
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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Learning Goals</h1>
            <p className="text-sm text-muted-foreground">Set intentions, track deadlines, and link goals to a playlist to watch progress add up automatically.</p>
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
              const progress = g.linkedPlaylistId ? progressMap[g.linkedPlaylistId] : undefined;
              const progressPercent = progress && progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;

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
                      <div className="min-w-0 flex-1 space-y-1">
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

                        {g.linkedPlaylistId && (
                          <div className="space-y-1 pt-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <Link href={`/my-playlists/${g.linkedPlaylistId}`} className="flex items-center gap-1 hover:text-foreground">
                                <ListVideo className="h-3.5 w-3.5" /> {g.linkedPlaylistTitle || "Linked playlist"}
                              </Link>
                              {progress && <span>{progress.watched} of {progress.total} watched ({progressPercent}%)</span>}
                            </div>
                            {progress && <Progress value={progressPercent} className="h-1.5" />}
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
        <DialogContent>
          <DialogHeader><DialogTitle>{editingGoal ? "Edit Goal" : "Add Goal"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Finish the JavaScript Closures playlist"
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
              <Label>Link to a playlist (optional)</Label>
              <Select value={form.linkedPlaylistId} onValueChange={(v) => setForm((f) => ({ ...f, linkedPlaylistId: v }))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="No linked playlist" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked playlist</SelectItem>
                  {playlists.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Linking shows real watched/total progress on this goal, pulled from that playlist.</p>
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
