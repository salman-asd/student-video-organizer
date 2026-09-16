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
import {
  getRoadmapTemplate,
  listLearningRoadmaps,
  updateLearningRoadmap,
  createLearningRoadmap,
} from "@/lib/firestore/roadmaps";
import { addGoal } from "@/lib/firestore/goals";
import { normalizeUserInterests, setUserInterestLevel } from "@/lib/userInterests";
import {
  renumberSteps,
  buildPlaylistSearchQuery,
  goalDraftTargetDate,
  parseImportedRoadmapText,
} from "@/lib/roadmapUtils";
import { searchPlaylistsForStep, type YouTubePlaylistSearchResult } from "@/lib/roadmapPlaylistClient";
import { suggestGoalsFromRoadmap, type GoalSuggestion } from "@/lib/goalSuggestionsClient";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Category, LearningRoadmap, RoadmapLevel, RoadmapStep, RoadmapTemplate, UserInterest } from "@/types";
import { Check, Sparkles, PencilLine, GripVertical, Plus, Trash2, Youtube, Target, X, Import } from "lucide-react";
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

  // Generates ONE level's roadmap. If the interest has subtopics set (a
  // "focus"), the result is personalized and gets written straight into
  // the user's own learningRoadmaps by the API route — never into the
  // shared roadmapTemplates doc, since that doc is global and would leak
  // one user's focus into everyone else's copy of this category. Returns
  // the parsed payload so callers (activateLevel) can tell which path ran.
  async function generateTemplate(categoryId: string, level: RoadmapLevel) {
    if (!user) return;
    const category = categories.find((item) => item.id === categoryId);
    const matchedInterest = interests.find((item) => item.categoryId === categoryId);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/roadmap/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          categoryName: category?.name || "Learning topic",
          level,
          subtopics: matchedInterest?.subtopics ?? [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to generate this roadmap.");
      await load();
      toast.success(`${level[0].toUpperCase()}${level.slice(1)} roadmap generated.`);
      return payload as { personalized?: boolean; roadmapId?: string };
    } catch (error: any) {
      toast.error(error?.message || "Unable to generate the roadmap.");
      throw error;
    }
  }

  async function regenerateRoadmap(categoryId: string, level: RoadmapLevel, roadmapId: string) {
    if (!user) return;
    const category = categories.find((item) => item.id === categoryId);
    const matchedInterest = interests.find((item) => item.categoryId === categoryId);
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/ai/roadmap/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          categoryName: category?.name || "Learning topic",
          level,
          subtopics: matchedInterest?.subtopics ?? [],
          roadmapId, // tells the API to overwrite this roadmap instead of creating a new one
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to regenerate this roadmap.");
      await load();
      toast.success("Roadmap regenerated to match your current focus.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to regenerate the roadmap.");
    }
  }

  // Shared tail of activateLevel: records the chosen level on the user's
  // interest profile once a roadmap (template-adopted, generated, or
  // imported) exists for it.
  async function finishActivatingLevel(categoryId: string, level: RoadmapLevel) {
    if (!user) return;
    const profileSnap = await getDoc(doc(db, "users", user.uid));
    const existing = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
    const next = setUserInterestLevel(existing, categoryId, level);
    await updateDoc(doc(db, "users", user.uid), { interests: next });
    await load();
    toast.success(`You're now learning ${level}.`);
  }

  async function activateLevel(categoryId: string, level: RoadmapLevel, hasRetried = false) {
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
        if (res.status === 404 && !hasRetried) {
          // No shared template exists yet for this level. Generate one —
          // if the user has a focus set, generation writes the personal
          // roadmap directly and there's nothing left to "adopt"; otherwise
          // it fills the shared template and we retry adopt against it.
          const generated = await generateTemplate(categoryId, level);
          if (generated?.personalized) {
            await finishActivatingLevel(categoryId, level);
            return;
          }
          return activateLevel(categoryId, level, true);
        }
        throw new Error(payload?.error || "Unable to adopt this roadmap.");
      }
      await finishActivatingLevel(categoryId, level);
    } catch (error: any) {
      toast.error(error?.message || "Unable to save your roadmap choice.");
    }
  }

  // Lets a user seed a level directly from pasted text (their own manual
  // roadmap, or one exported from another AI tool) without calling the AI
  // at all. Used both for a brand-new interest (no roadmap yet) and to
  // replace an existing personal roadmap's steps (see PersonalRoadmapEditor).
  async function importRoadmap(categoryId: string, level: RoadmapLevel, steps: RoadmapStep[]) {
    if (!user) return;
    if (steps.length === 0) {
      toast.error("Couldn't find any steps in that text — try JSON or a numbered list.");
      return;
    }
    try {
      await createLearningRoadmap(user.uid, categoryId, level, steps, "imported");
      await finishActivatingLevel(categoryId, level);
    } catch (error: any) {
      toast.error(error?.message || "Unable to import this roadmap.");
    }
  }

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

  // Before creating a brand-new interest, ask the AI whether the typed
  // name is ambiguous (e.g. "C#" — language track vs. game-dev vs. web).
  // If so, surface options and wait for the user's pick instead of
  // silently guessing. Clarify is best-effort: any failure just falls
  // through to creating the interest as typed.
  const [clarifyOptions, setClarifyOptions] = React.useState<{ label: string; description: string }[] | null>(null);
  const [clarifyPendingName, setClarifyPendingName] = React.useState("");

  async function addInterestFromName(nextName: string) {
    if (!user || !nextName.trim()) return;
    const trimmed = nextName.trim();
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/roadmap/clarify", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const result = await res.json().catch(() => ({ ambiguous: false }));
      if (res.ok && result?.ambiguous && result.options?.length) {
        setClarifyOptions(result.options);
        setClarifyPendingName(trimmed);
        return;
      }
    } catch {
      // best-effort — fall through to creating the interest as typed
    }
    await createInterest(trimmed);
  }

  async function createInterest(name: string) {
    if (!user) return;
    try {
      const categoryId = await createCategory(name, user.uid);
      const nextInterests = normalizeUserInterests([
        ...interests,
        { categoryId, level: null },
      ]);
      await updateDoc(doc(db, "users", user.uid), { interests: nextInterests });
      setInterests(nextInterests);
      setClarifyOptions(null);
      setClarifyPendingName("");
      setNewInterestName("");
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
              {clarifyOptions && (
                <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                  <p className="text-sm text-muted-foreground">
                    Did you mean one of these for "{clarifyPendingName}"?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {clarifyOptions.map((option) => (
                      <Button
                        key={option.label}
                        variant="outline"
                        size="sm"
                        title={option.description}
                        onClick={() => void createInterest(option.label)}
                      >
                        {option.label}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" onClick={() => void createInterest(clarifyPendingName)}>
                      Use "{clarifyPendingName}" as typed
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {interestCards.map((category) => {
            const matchedInterest = interests.find((interest) => interest.categoryId === category.id);
            const level = matchedInterest?.level ?? "basic";
            // Only this category's templates for the CURRENTLY SELECTED
            // level — previously this rendered basic+intermediate+advanced
            // stacked together regardless of which level was active.
            const levelTemplates = (templates[category.id] ?? []).filter((t) => t.level === level);
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
                      <FocusEditor
                        categoryId={category.id}
                        currentSubtopics={matchedInterest?.subtopics ?? []}
                        onSaved={load}
                      />
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

                  {levelTemplates.length > 0 && (
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
                                  {step.week ?? index + 1}
                                </span>
                                <div>
                                  <div className="font-medium">
                                    {step.week ? <span className="text-muted-foreground">Week {step.week} — </span> : null}
                                    {step.title}
                                  </div>
                                  {step.description && <p className="text-muted-foreground">{step.description}</p>}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeRoadmap ? (
                    <PersonalRoadmapEditor
                      category={category}
                      level={level}
                      roadmap={activeRoadmap}
                      onSaveSteps={(steps) => void saveRoadmapSteps(category.id, activeRoadmap.id, steps)}
                      onRegenerate={() => void regenerateRoadmap(category.id, level, activeRoadmap.id)}
                    />
                  ) : (
                    <NoPersonalRoadmapYet
                      hasSuggested={levelTemplates.length > 0}
                      onAdopt={() => void activateLevel(category.id, level)}
                      onGenerate={() => void generateTemplate(category.id, level)}
                      onImport={(steps) => void importRoadmap(category.id, level, steps)}
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

function NoPersonalRoadmapYet({
  hasSuggested,
  onAdopt,
  onGenerate,
  onImport,
}: {
  hasSuggested: boolean;
  onAdopt: () => void;
  onGenerate: () => void;
  onImport: (steps: RoadmapStep[]) => void;
}) {
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState("");

  function submitImport() {
    const parsed = parseImportedRoadmapText(importText);
    onImport(parsed);
    if (parsed.length > 0) {
      setImportOpen(false);
      setImportText("");
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {hasSuggested ? "You haven't started this level yet." : "No roadmap yet for this level."}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
            <Import className="mr-1 h-3.5 w-3.5" /> Create custom roadmap
          </Button>
          {hasSuggested ? (
            <Button size="sm" onClick={onAdopt}>Use this roadmap</Button>
          ) : (
            <Button size="sm" onClick={onGenerate}>Generate</Button>
          )}
        </div>
      </div>
      {importOpen && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Paste a roadmap you already have — JSON like <code>{"[{title, description, week}]"}</code>, or a plain numbered list, one step per line.
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            placeholder={"Week 1: Basic greetings — practice 10 phrases daily\nWeek 2: ..."}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={submitImport}>Use this roadmap</Button>
            <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Focus editor: lets a user say WHAT within a topic they want (e.g.
// "Speaking, Writing" for English) so roadmap generation can target it. ──

function FocusEditor({
  categoryId,
  currentSubtopics,
  onSaved,
}: {
  categoryId: string;
  currentSubtopics: string[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(currentSubtopics.join(", "));

  React.useEffect(() => {
    setValue(currentSubtopics.join(", "));
  }, [currentSubtopics]);

  async function save() {
    if (!user) return;
    const subtopics = value.split(",").map((s) => s.trim()).filter(Boolean);
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const existing = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
      const next = existing.map((interest) =>
        interest.categoryId === categoryId ? { ...interest, subtopics } : interest
      );
      await updateDoc(doc(db, "users", user.uid), { interests: next });
      setEditing(false);
      onSaved();
      toast.success("Focus updated. Regenerate this level to reflect it.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update your focus.");
    }
  }

  if (!editing) {
    return (
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(true)}>
        {currentSubtopics.length ? "Edit focus" : "Set a focus (e.g. Speaking, Writing)"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Speaking, Writing, Listening"
        className="h-8 max-w-xs text-xs"
        autoFocus
      />
      <Button size="sm" className="h-8" onClick={() => void save()}>Save</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>Cancel</Button>
    </div>
  );
}

// ── Personal roadmap: editable steps + per-step playlist suggestions + goal suggestions ──

function PersonalRoadmapEditor({
  category,
  level,
  roadmap,
  onSaveSteps,
  onRegenerate,
}: {
  category: Category;
  level: RoadmapLevel;
  roadmap: LearningRoadmap;
  onSaveSteps: (steps: RoadmapStep[]) => void;
  onRegenerate: () => void;
}) {
  const { user } = useAuth();
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<{ title: string; description: string }>({ title: "", description: "" });

  const [playlistResults, setPlaylistResults] = React.useState<Record<number, YouTubePlaylistSearchResult[]>>({});
  const [playlistLoading, setPlaylistLoading] = React.useState<number | null>(null);
  const [addedPlaylists, setAddedPlaylists] = React.useState<{ id: string; title: string }[]>([]);

  const [goalSuggestions, setGoalSuggestions] = React.useState<GoalSuggestion[] | null>(null);
  const [goalsLoading, setGoalsLoading] = React.useState(false);

  // Replace this roadmap's steps entirely with pasted text — e.g. a
  // roadmap the user already made by hand or generated with another AI.
  const [importOpen, setImportOpen] = React.useState(false);
  const [importText, setImportText] = React.useState("");

  function importSteps() {
    const parsed = parseImportedRoadmapText(importText);
    if (parsed.length === 0) {
      toast.error("Couldn't find any steps in that text — try JSON or a numbered list.");
      return;
    }
    onSaveSteps(parsed);
    setImportOpen(false);
    setImportText("");
    toast.success(`Imported ${parsed.length} step${parsed.length === 1 ? "" : "s"}.`);
  }

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
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add step
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
            <Import className="mr-1 h-3.5 w-3.5" /> Import roadmap
          </Button>
          <Button size="sm" variant="outline" onClick={onRegenerate}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Regenerate
          </Button>
          <Button size="sm" variant="outline" onClick={() => void suggestGoals()} disabled={goalsLoading || roadmap.steps.length === 0}>
            <Target className="mr-1 h-3.5 w-3.5" /> {goalsLoading ? "Thinking…" : "Suggest goals from this roadmap"}
          </Button>
        </div>
      </div>

      {importOpen && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            Paste a roadmap you already have — JSON (<code>{"[{title, description, week}]"}</code>) or a plain numbered list. This replaces the steps below.
          </p>
          <Textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={6}
            placeholder={"1. Learn basic greetings — practice 10 phrases daily\n2. ..."}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={importSteps}>Replace steps</Button>
            <Button size="sm" variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

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
                {step.week ?? index + 1}
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
                    <div className="font-medium">
                      {step.week ? <span className="text-muted-foreground">Week {step.week} — </span> : null}
                      {step.title}
                    </div>
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
