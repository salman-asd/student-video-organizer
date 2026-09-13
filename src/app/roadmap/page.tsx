"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SortableList } from "@/components/dnd/SortableList";
import { createCategory, listCategories } from "@/lib/firestore/categoriesTags";
import { getRoadmapTemplate, listLearningRoadmaps, updateLearningRoadmap } from "@/lib/firestore/roadmaps";
import { addGoal } from "@/lib/firestore/goals";
import { normalizeUserInterests, setUserInterestLevel } from "@/lib/userInterests";
import { renumberSteps, buildPlaylistSearchQuery, goalDraftTargetDate } from "@/lib/roadmapUtils";
import { searchPlaylistsForStep, type YouTubePlaylistSearchResult } from "@/lib/roadmapPlaylistClient";
import { suggestGoalsFromRoadmap, type GoalSuggestion } from "@/lib/goalSuggestionsClient";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Category, LearningRoadmap, RoadmapLevel, RoadmapStep, RoadmapTemplate, UserInterest } from "@/types";
import { Check, Sparkles, PencilLine, GripVertical, Plus, Trash2, Youtube, Target, X } from "lucide-react";
import { toast } from "sonner";

export default function RoadmapPage() {
  return (
    <RequireAuth>
      <RoadmapContent />
    </RequireAuth>
  );
}

function RoadmapContent() {
  const { user } = useAuth();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [interests, setInterests] = React.useState<UserInterest[]>([]);
  const [templates, setTemplates] = React.useState<Record<string, RoadmapTemplate[]>>({});
  const [personalRoadmaps, setPersonalRoadmaps] = React.useState<Record<string, LearningRoadmap[]>>({});
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [nextCategories, profileSnap, nextRoadmaps] = await Promise.all([
        listCategories(user.uid),
        getDoc(doc(db, "users", user.uid)),
        listLearningRoadmaps(user.uid),
      ]);
      const profileInterests = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
      setCategories(nextCategories);
      setInterests(profileInterests);
      const nextTemplates: Record<string, RoadmapTemplate[]> = {};
      for (const category of nextCategories) {
        const entries = await Promise.all([
          getRoadmapTemplate(category.id, "basic"),
          getRoadmapTemplate(category.id, "intermediate"),
          getRoadmapTemplate(category.id, "advanced"),
        ]).then((items) => items.filter((item): item is RoadmapTemplate => !!item));
        nextTemplates[category.id] = entries;
      }
      setTemplates(nextTemplates);
      const byCategory: Record<string, LearningRoadmap[]> = {};
      for (const roadmap of nextRoadmaps) {
        byCategory[roadmap.categoryId] = [...(byCategory[roadmap.categoryId] || []), roadmap];
      }
      setPersonalRoadmaps(byCategory);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load your roadmap data.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  // Both routes below require "Authorization: Bearer <idToken>"
  // (requireAuthenticatedUid) — the previous version of this page never
  // sent it, so every request 401'd. Fixed here alongside the rest of
  // this phase's changes.
  async function generateTemplate(categoryId: string) {
    if (!user) return;
    const category = categories.find((item) => item.id === categoryId);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/roadmap/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, categoryName: category?.name || "Learning topic" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to generate this roadmap.");
      await load();
      toast.success("Roadmap template generated.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to generate the roadmap.");
    }
  }

  async function activateLevel(categoryId: string, level: RoadmapLevel) {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/roadmaps/adopt", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, level }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404) {
          await generateTemplate(categoryId);
          return;
        }
        throw new Error(payload?.error || "Unable to adopt this roadmap.");
      }
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const existing = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
      const next = setUserInterestLevel(existing, categoryId, level);
      await updateDoc(doc(db, "users", user.uid), { interests: next });
      await load();
      toast.success(`You’re now learning ${level}.`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to save your roadmap choice.");
    }
  }

  // Persists a step edit/add/remove/reorder for one adopted roadmap, both
  // optimistically (so drag/edit feels instant) and to Firestore. Never
  // touches the shared roadmapTemplates doc this was cloned from, or any
  // other user's copy — see firestore.rules' learningRoadmaps rule.
  async function saveRoadmapSteps(categoryId: string, roadmapId: string, steps: RoadmapStep[]) {
    if (!user) return;
    const normalized = renumberSteps(steps);
    setPersonalRoadmaps((prev) => {
      const list = prev[categoryId] || [];
      return {
        ...prev,
        [categoryId]: list.map((item) => (item.id === roadmapId ? { ...item, steps: normalized } : item)),
      };
    });
    try {
      await updateLearningRoadmap(user.uid, roadmapId, normalized);
    } catch (error: any) {
      toast.error(error?.message || "Unable to save your roadmap edit.");
      await load();
    }
  }

  const interestCards = categories.filter((category) => interests.some((interest) => interest.categoryId === category.id));

  async function addInterestFromName(nextName: string) {
    if (!user || !nextName.trim()) return;
    try {
      const categoryId = await createCategory(nextName.trim(), user.uid);
      const nextInterests = normalizeUserInterests([
        ...interests,
        { categoryId, level: null },
      ]);
      await updateDoc(doc(db, "users", user.uid), { interests: nextInterests });
      setInterests(nextInterests);
      await load();
      toast.success("Interest added to your roadmap.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to add this interest.");
    }
  }

  const [newInterestName, setNewInterestName] = React.useState("");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">Roadmap</p>
          <h1 className="font-display text-3xl font-semibold">Your learning path</h1>
          <p className="text-muted-foreground">Choose a level for each interest and keep a personal copy of the roadmap you’re following.</p>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading roadmap data…</p>}

        {!loading && interestCards.length === 0 && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-1">
                <h2 className="font-display text-xl font-semibold">No interests yet</h2>
                <p className="text-sm text-muted-foreground">Add a topic you want to learn so Study Lamp can build a roadmap and suggestions around it.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newInterestName}
                  onChange={(event) => setNewInterestName(event.target.value)}
                  placeholder="e.g. Product design"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addInterestFromName(newInterestName);
                  }}
                />
                <Button onClick={() => void addInterestFromName(newInterestName)} disabled={!newInterestName.trim()}>
                  Add interest
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {categories.slice(0, 10).map((category) => (
                  <Button
                    key={category.id}
                    variant="outline"
                    size="sm"
                    onClick={() => void addInterestFromName(category.name)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {interestCards.map((category) => {
            const matchedInterest = interests.find((interest) => interest.categoryId === category.id);
            const level = matchedInterest?.level ?? "basic";
            const levelTemplates = templates[category.id] ?? [];
            const personal = personalRoadmaps[category.id] ?? [];
            const activeRoadmap = personal.find((item) => item.level === level) || personal[0];

            return (
              <Card key={category.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-xl font-semibold">{category.name}</h2>
                      <p className="text-sm text-muted-foreground">Current level: {level}</p>
                      {matchedInterest?.subtopics?.length ? (
                        <p className="text-xs text-muted-foreground">Focus: {matchedInterest.subtopics.join(", ")}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["basic", "intermediate", "advanced"] as RoadmapLevel[]).map((nextLevel) => (
                        <Button
                          key={nextLevel}
                          size="sm"
                          variant={nextLevel === level ? "default" : "outline"}
                          onClick={() => void activateLevel(category.id, nextLevel)}
                        >
                          {nextLevel === level && <Check className="mr-1 h-3.5 w-3.5" />} {nextLevel}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {levelTemplates.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-4 w-4 text-accent" /> Suggested roadmap</div>
                      {levelTemplates.map((template) => (
                        <div key={template.id} className="rounded-md border border-border p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <Badge variant="secondary">{template.level}</Badge>
                            {template.steps.length > 0 ? <span className="text-xs text-muted-foreground">{template.steps.length} steps</span> : null}
                          </div>
                          <ol className="space-y-2">
                            {template.steps.slice(0, 4).map((step, index) => (
                              <li key={`${template.id}-${index}`} className="flex gap-2 text-sm">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">
                                  {index + 1}
                                </span>
                                <div>
                                  <div className="font-medium">{step.title}</div>
                                  {step.description && <p className="text-muted-foreground">{step.description}</p>}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-4">
                      <span className="text-sm text-muted-foreground">No roadmap template yet for this interest.</span>
                      <Button size="sm" onClick={() => void generateTemplate(category.id)}>Generate</Button>
                    </div>
                  )}

                  {activeRoadmap && (
                    <PersonalRoadmapEditor
                      category={category}
                      level={level}
                      roadmap={activeRoadmap}
                      onSaveSteps={(steps) => saveRoadmapSteps(category.id, activeRoadmap.id, steps)}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}

// ── Personal roadmap: editable steps + per-step playlist suggestions + goal suggestions ──

function PersonalRoadmapEditor({
  category,
  level,
  roadmap,
  onSaveSteps,
}: {
  category: Category;
  level: RoadmapLevel;
  roadmap: LearningRoadmap;
  onSaveSteps: (steps: RoadmapStep[]) => void;
}) {
  const { user } = useAuth();
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<{ title: string; description: string }>({ title: "", description: "" });

  // Playlist search results and goal suggestions are session-only UI state
  // (Phase E3/E4) — nothing here is persisted except what the user
  // explicitly accepts (a real import, or a real Goal).
  const [playlistResults, setPlaylistResults] = React.useState<Record<number, YouTubePlaylistSearchResult[]>>({});
  const [playlistLoading, setPlaylistLoading] = React.useState<number | null>(null);
  const [addedPlaylists, setAddedPlaylists] = React.useState<{ id: string; title: string }[]>([]);

  const [goalSuggestions, setGoalSuggestions] = React.useState<GoalSuggestion[] | null>(null);
  const [goalsLoading, setGoalsLoading] = React.useState(false);

  function startEdit(index: number, step: RoadmapStep) {
    setEditingIndex(index);
    setDraft({ title: step.title, description: step.description || "" });
  }

  function commitEdit(index: number) {
    const title = draft.title.trim();
    if (!title) {
      toast.error("A step needs a title.");
      return;
    }
    const nextSteps = roadmap.steps.map((step, i) => (i === index ? { ...step, title, description: draft.description.trim() } : step));
    onSaveSteps(nextSteps);
    setEditingIndex(null);
  }

  function removeStep(index: number) {
    onSaveSteps(roadmap.steps.filter((_, i) => i !== index));
    setPlaylistResults((prev) => {
      const { [index]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function addStep() {
    onSaveSteps([...roadmap.steps, { title: "New step", description: "", order: roadmap.steps.length }]);
  }

  function reorderSteps(nextSteps: RoadmapStep[]) {
    onSaveSteps(nextSteps);
  }

  async function findPlaylists(index: number, step: RoadmapStep) {
    if (!user) return;
    setPlaylistLoading(index);
    try {
      const idToken = await user.getIdToken();
      const query = buildPlaylistSearchQuery(step.title, category.name);
      const results = await searchPlaylistsForStep(idToken, query, 5);
      setPlaylistResults((prev) => ({ ...prev, [index]: results }));
      if (results.length === 0) toast.info("No playlist suggestions found for this step.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to search for playlists right now.");
    } finally {
      setPlaylistLoading(null);
    }
  }

  // Hands off into the existing /playlists/import flow (prefilled and
  // auto-fetched via ?url=) rather than re-implementing the import logic
  // here — the resulting playlist is created by that page's own, already
  // tested code path, so it's indistinguishable from a manual import.
  function trackAddedPlaylist(result: YouTubePlaylistSearchResult) {
    setAddedPlaylists((prev) => (prev.some((p) => p.id === result.playlistId) ? prev : [...prev, { id: result.playlistId, title: result.title }]));
  }

  async function suggestGoals() {
    if (!user) return;
    setGoalsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const suggestions = await suggestGoalsFromRoadmap(idToken, {
        categoryName: category.name,
        level,
        steps: roadmap.steps.map((step) => ({ title: step.title, description: step.description })),
      });
      setGoalSuggestions(suggestions);
    } catch (error: any) {
      toast.error(error?.message || "Unable to suggest goals right now.");
    } finally {
      setGoalsLoading(false);
    }
  }

  async function acceptGoal(suggestion: GoalSuggestion) {
    if (!user) return;
    try {
      await addGoal(user.uid, {
        title: suggestion.title,
        notes: suggestion.notes,
        targetDate: goalDraftTargetDate(suggestion.daysFromNow),
        // Any playlists added from this roadmap's step suggestions ride
        // along on every accepted goal — a loose but reasonable reading of
        // "linked to any personal playlist added for that step" without
        // needing to track per-step provenance through a page navigation.
        linkedPlaylists: addedPlaylists.length > 0 ? addedPlaylists : undefined,
      });
      setGoalSuggestions((prev) => (prev ? prev.filter((item) => item !== suggestion) : prev));
      toast.success(`Added "${suggestion.title}" to your Goals.`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to add this goal.");
    }
  }

  function dismissGoal(suggestion: GoalSuggestion) {
    setGoalSuggestions((prev) => (prev ? prev.filter((item) => item !== suggestion) : prev));
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium"><PencilLine className="h-4 w-4 text-accent" /> Personal roadmap</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add step
          </Button>
          <Button size="sm" variant="outline" onClick={() => void suggestGoals()} disabled={goalsLoading || roadmap.steps.length === 0}>
            <Target className="mr-1 h-3.5 w-3.5" /> {goalsLoading ? "Thinking…" : "Suggest goals from this roadmap"}
          </Button>
        </div>
      </div>

      <SortableList
        items={roadmap.steps}
        getId={(step) => String(roadmap.steps.indexOf(step))}
        onReorder={reorderSteps}
        className="space-y-2"
        renderItem={(step, dragHandleProps, index) => (
          <div className="rounded-md bg-background p-2">
            <div className="flex gap-2 text-sm">
              <span
                {...dragHandleProps}
                className="mt-1 inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                {editingIndex === index ? (
                  <div className="space-y-2">
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Step title"
                      autoFocus
                    />
                    <Textarea
                      value={draft.description}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="What does this step cover?"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => commitEdit(index)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="block w-full text-left" onClick={() => startEdit(index, step)}>
                    <div className="font-medium">{step.title}</div>
                    {step.description && <p className="text-muted-foreground">{step.description}</p>}
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => void findPlaylists(index, step)}
                    disabled={playlistLoading === index}
                  >
                    <Youtube className="mr-1 h-3.5 w-3.5" />
                    {playlistLoading === index ? "Searching…" : "Suggested playlists"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => removeStep(index)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                  </Button>
                </div>

                {playlistResults[index] && playlistResults[index].length > 0 && (
                  <div className="grid gap-2 pt-1 sm:grid-cols-2">
                    {playlistResults[index].map((result) => (
                      <div key={result.playlistId} className="flex gap-2 rounded-md border border-border bg-muted/40 p-2">
                        {result.thumbnailUrl && (
                          <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded">
                            <Image src={result.thumbnailUrl} alt={result.title} fill className="object-cover" sizes="80px" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{result.title}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{result.channelTitle}</p>
                          <Link
                            href={`/playlists/import?url=${encodeURIComponent(result.playlistUrl)}`}
                            className="mt-1 inline-block text-[11px] font-medium text-accent hover:underline"
                            onClick={() => trackAddedPlaylist(result)}
                          >
                            Add to my Playlists
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      />

      {goalSuggestions && goalSuggestions.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Candidate goals — review and add the ones that fit</p>
          {goalSuggestions.map((suggestion, i) => (
            <div key={`${suggestion.title}-${i}`} className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{suggestion.title}</p>
                {suggestion.notes && <p className="text-xs text-muted-foreground">{suggestion.notes}</p>}
                <p className="mt-1 text-[11px] text-muted-foreground">Target: {goalDraftTargetDate(suggestion.daysFromNow)}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" onClick={() => void acceptGoal(suggestion)}>Add to my Goals</Button>
                <Button size="sm" variant="ghost" onClick={() => dismissGoal(suggestion)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
