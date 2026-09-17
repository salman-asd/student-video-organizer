"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SortableList } from "@/components/dnd/SortableList";
import { createCategory, listCategories } from "@/lib/firestore/categoriesTags";
import { listLearningRoadmaps, updateLearningRoadmap, createLearningRoadmap } from "@/lib/firestore/roadmaps";
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
import type { Category, LearningRoadmap, RoadmapLevel, RoadmapStep, UserInterest } from "@/types";
import {
  Check, Sparkles, PencilLine, GripVertical, Plus, Trash2, Youtube, Target, X, Import, Copy, Eye, ChevronDown, ChevronRight,
} from "lucide-react";
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

  // Every category+level has exactly ONE roadmap doc per user. This
  // single function handles both "Generate" (roadmap is undefined) and
  // "Regenerate" (roadmap already exists) — the API route upserts either
  // way, so the caller never has to think about which case it is.
  async function generateOrRegenerate(categoryId: string, level: RoadmapLevel, roadmap: LearningRoadmap | undefined) {
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
          roadmapId: roadmap?.id,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to generate this roadmap.");
      await load();
      toast.success(roadmap ? "Roadmap regenerated." : `${level[0].toUpperCase()}${level.slice(1)} roadmap generated.`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to generate the roadmap.");
    }
  }

  // Switching level is just a preference change now — no roadmap is
  // created as a side effect. If the newly selected level has no roadmap
  // yet, the panel shows its own empty state with Generate/Customize.
  async function setActiveLevel(categoryId: string, level: RoadmapLevel) {
    if (!user) return;
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const existing = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
      const next = setUserInterestLevel(existing, categoryId, level);
      await updateDoc(doc(db, "users", user.uid), { interests: next });
      await load();
    } catch (error: any) {
      toast.error(error?.message || "Unable to switch level.");
    }
  }

  // Saves an edited/added/removed/reordered/imported step list. Creates
  // the roadmap doc on first save if none exists yet (this is how
  // "Customize" on an empty roadmap works — write your own from scratch).
  async function saveRoadmapSteps(categoryId: string, level: RoadmapLevel, roadmap: LearningRoadmap | undefined, steps: RoadmapStep[]) {
    if (!user) return;
    const normalized = renumberSteps(steps);

    if (roadmap) {
      setPersonalRoadmaps((prev) => {
        const list = prev[categoryId] || [];
        return {
          ...prev,
          [categoryId]: list.map((item) => (item.id === roadmap.id ? { ...item, steps: normalized } : item)),
        };
      });
      try {
        await updateLearningRoadmap(user.uid, roadmap.id, normalized);
      } catch (error: any) {
        toast.error(error?.message || "Unable to save your roadmap edit.");
        await load();
      }
      return;
    }

    if (normalized.length === 0) return; // nothing to create yet
    try {
      await createLearningRoadmap(user.uid, categoryId, level, normalized, "imported");
      await load();
      toast.success("Roadmap created.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to create your roadmap.");
    }
  }

  const interestCards = categories.filter((category) => interests.some((interest) => interest.categoryId === category.id));

  // Multiple roadmaps on one page means a LOT of scrolling, so each panel is
  // collapsible. With only one interest the panel opens by default (nothing to
  // scroll past); with two or more they all start collapsed so the page height
  // matches what you're actually looking at. `expandedIds` tracks what's open;
  // any category not yet in it falls back to that default, which also handles
  // interests being added later without resetting what you already opened.
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const defaultExpanded = interestCards.length <= 1;
  const isExpanded = (categoryId: string) => expandedIds.has(categoryId) || (defaultExpanded && !expandedIds.has(`closed:${categoryId}`));
  const toggleExpanded = (categoryId: string) => {
    setExpandedIds((prev) => {
      const wasExpanded = prev.has(categoryId) || (defaultExpanded && !prev.has(`closed:${categoryId}`));
      const next = new Set(prev);
      if (wasExpanded) {
        next.delete(categoryId);
        next.add(`closed:${categoryId}`);
      } else {
        next.delete(`closed:${categoryId}`);
        next.add(categoryId);
      }
      return next;
    });
  };

  // Before creating a brand-new interest, ask the AI whether the typed
  // name is ambiguous (e.g. "C#" — language track vs. game-dev vs. web).
  // Clarify is best-effort: any failure just falls through to creating
  // the interest as typed.
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
        body: JSON.stringify({ name: trimmed, kind: "topic" }),
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

  async function saveFocus(categoryId: string, subtopics: string[]) {
    if (!user) return;
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      const existing = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);
      const next = existing.map((interest) =>
        interest.categoryId === categoryId ? { ...interest, subtopics } : interest
      );
      await updateDoc(doc(db, "users", user.uid), { interests: next });
      await load();
      toast.success("Focus updated. Regenerate to reflect it in your roadmap.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update your focus.");
    }
  }

  const [newInterestName, setNewInterestName] = React.useState("");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6 py-8">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">Roadmap</p>
          <h1 className="font-display text-3xl font-semibold">Your learning path</h1>
          <p className="text-muted-foreground">Choose a level for each interest and keep a personal, editable roadmap for it.</p>
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

        {/* Quick-jump bar: with several roadmap panels the page gets tall, so
            this stays stuck under the top of the viewport and scrolls you
            straight to the interest you want instead of hunting for it. */}
        {interestCards.length > 1 && (
          <div className="sticky top-2 z-20 -mx-1 overflow-x-auto rounded-md border-border bg-background/95 px-2 py-2 shadow-sm backdrop-blur">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Jump to</span>
              {interestCards.map((category) => (
                <Button
                  key={category.id}
                  size="sm"
                  variant="outline"
                  onClick={() => document.getElementById(`interest-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                >
                  {category.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {interestCards.map((category) => {
            const matchedInterest = interests.find((interest) => interest.categoryId === category.id);
            const level = matchedInterest?.level ?? "basic";
            const personal = personalRoadmaps[category.id] ?? [];
            const activeRoadmap = personal.find((item) => item.level === level);
            const expanded = isExpanded(category.id);
            // Which levels already have their own roadmap (they're stored
            // separately per category+level) — surfaced as dots on the level
            // buttons so you can see it without opening each one.
            const levelsWithRoadmap = new Set(personal.map((item) => item.level));

            return (
              <Card key={category.id} id={`interest-${category.id}`} className="scroll-mt-20">
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        aria-expanded={expanded}
                        aria-label={expanded ? `Collapse ${category.name}` : `Expand ${category.name}`}
                        onClick={() => toggleExpanded(category.id)}
                      >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      <div>
                        <h2 className="font-display text-xl font-semibold">{category.name}</h2>
                        <p className="text-sm text-muted-foreground">Current level: {level}</p>
                        {matchedInterest?.subtopics?.length ? (
                          <p className="text-xs text-muted-foreground">Focus: {matchedInterest.subtopics.join(", ")}</p>
                        ) : null}
                        {!expanded && (
                          <p className="text-xs text-muted-foreground">
                            {activeRoadmap?.steps?.length
                              ? `${activeRoadmap.steps.length} step${activeRoadmap.steps.length === 1 ? "" : "s"} at this level — expand to view.`
                              : "No roadmap at this level yet — expand to generate one."}
                          </p>
                        )}
                        <FocusEditor
                          categoryName={category.name}
                          currentSubtopics={matchedInterest?.subtopics ?? []}
                          onSave={(subtopics) => saveFocus(category.id, subtopics)}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["basic", "intermediate", "advanced"] as RoadmapLevel[]).map((nextLevel) => (
                        <Button
                          key={nextLevel}
                          size="sm"
                          variant={nextLevel === level ? "default" : "outline"}
                          title={levelsWithRoadmap.has(nextLevel) ? `A ${nextLevel} roadmap already exists` : `No ${nextLevel} roadmap yet`}
                          onClick={() => void setActiveLevel(category.id, nextLevel)}
                        >
                          {nextLevel === level && <Check className="mr-1 h-3.5 w-3.5" />} {nextLevel}
                          {levelsWithRoadmap.has(nextLevel) && (
                            <span
                              className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${nextLevel === level ? "bg-primary-foreground" : "bg-accent"}`}
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {expanded && (
                    <RoadmapPanel
                      category={category}
                      level={level}
                      subtopics={matchedInterest?.subtopics ?? []}
                      roadmap={activeRoadmap}
                      onGenerateOrRegenerate={() => generateOrRegenerate(category.id, level, activeRoadmap)}
                      onSaveSteps={(steps) => saveRoadmapSteps(category.id, level, activeRoadmap, steps)}
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

// ── Focus editor: lets a user say WHAT within a topic they want (e.g.
// "Speaking, Writing" for English), with ambiguity clarification since a
// focus itself can be too broad (e.g. "English" alone could mean
// Literature, Grammar, IELTS prep, or Spoken English). ──

function FocusEditor({
  categoryName,
  currentSubtopics,
  onSave,
}: {
  categoryName: string;
  currentSubtopics: string[];
  onSave: (subtopics: string[]) => void;
}) {
  const { user } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(currentSubtopics.join(", "));
  const [checking, setChecking] = React.useState(false);
  const [clarifyOptions, setClarifyOptions] = React.useState<{ label: string; description: string }[] | null>(null);

  React.useEffect(() => {
    setValue(currentSubtopics.join(", "));
  }, [currentSubtopics]);

  async function commit(rawValue: string) {
    const subtopics = rawValue.split(",").map((s) => s.trim()).filter(Boolean);
    if (subtopics.length === 0) {
      setEditing(false);
      setClarifyOptions(null);
      onSave([]);
      return;
    }
    if (!user) return;
    setChecking(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/roadmap/clarify", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: subtopics.join(", "), context: categoryName, kind: "focus" }),
      });
      const result = await res.json().catch(() => ({ ambiguous: false }));
      if (res.ok && result?.ambiguous && result.options?.length) {
        setClarifyOptions(result.options);
        setChecking(false);
        return;
      }
    } catch {
      // best-effort — fall through to saving as typed
    }
    setChecking(false);
    setEditing(false);
    setClarifyOptions(null);
    onSave(subtopics);
  }

  function pickClarifiedOption(label: string) {
    setValue(label);
    setClarifyOptions(null);
    setEditing(false);
    onSave([label]);
  }

  if (!editing) {
    return (
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditing(true)}>
        {currentSubtopics.length ? "Edit focus" : "Set a focus (e.g. Speaking, Writing)"}
      </Button>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Speaking, Writing, Listening"
          className="h-8 max-w-xs text-xs"
          autoFocus
        />
        <Button size="sm" className="h-8" onClick={() => void commit(value)} disabled={checking}>
          {checking ? "Checking…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setEditing(false); setClarifyOptions(null); }}>
          Cancel
        </Button>
      </div>
      {clarifyOptions && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-2">
          <p className="text-xs text-muted-foreground">
            "{value}" could mean a few different things within {categoryName || "this topic"} — did you mean:
          </p>
          <div className="flex flex-wrap gap-2">
            {clarifyOptions.map((option) => (
              <Button
                key={option.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                title={option.description}
                onClick={() => pickClarifiedOption(option.label)}
              >
                {option.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void commit(value)}>
              Use "{value}" as typed
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── The single roadmap panel for a category+level. View mode shows a
// clean read-only list (what "Suggested roadmap" used to be); Customize
// mode is the full editor (add/edit/remove/reorder/import) — both operate
// on the SAME roadmap doc, so nothing here is ever read-only by design. ──

function RoadmapPanel({
  category,
  level,
  subtopics,
  roadmap,
  onGenerateOrRegenerate,
  onSaveSteps,
}: {
  category: Category;
  level: RoadmapLevel;
  subtopics: string[];
  roadmap: LearningRoadmap | undefined;
  onGenerateOrRegenerate: () => Promise<void>;
  onSaveSteps: (steps: RoadmapStep[]) => void;
}) {
  const { user } = useAuth();
  const [mode, setMode] = React.useState<"view" | "customize">("view");
  const [generating, setGenerating] = React.useState(false);

  const [promptOpen, setPromptOpen] = React.useState(false);
  const [promptText, setPromptText] = React.useState<string | null>(null);
  const [promptLoading, setPromptLoading] = React.useState(false);

  const hasSteps = !!roadmap && roadmap.steps.length > 0;

  async function handleGenerate() {
    setGenerating(true);
    try {
      await onGenerateOrRegenerate();
    } finally {
      setGenerating(false);
    }
  }

  async function togglePrompt() {
    if (promptOpen) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(true);
    if (promptText) return;
    if (!user) return;
    setPromptLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/ai/roadmap/prompt", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ categoryName: category.name, level, subtopics }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Unable to build the prompt.");
      setPromptText(payload.prompt as string);
    } catch (error: any) {
      toast.error(error?.message || "Unable to build the prompt.");
      setPromptOpen(false);
    } finally {
      setPromptLoading(false);
    }
  }

  async function copyPrompt() {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      toast.success("Prompt copied.");
    } catch {
      toast.error("Couldn't copy automatically — select and copy the text manually.");
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {mode === "view" ? <Sparkles className="h-4 w-4 text-accent" /> : <PencilLine className="h-4 w-4 text-accent" />}
          {mode === "view" ? "Suggested roadmap" : "Customize roadmap"}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setMode((m) => (m === "view" ? "customize" : "view"))}>
            {mode === "view" ? (
              <><PencilLine className="mr-1 h-3.5 w-3.5" /> Customize</>
            ) : (
              <><Eye className="mr-1 h-3.5 w-3.5" /> View</>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleGenerate()} disabled={generating}>
            <Sparkles className="mr-1 h-3.5 w-3.5" /> {generating ? "Generating…" : hasSteps ? "Regenerate" : "Generate"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void togglePrompt()}>
            {promptOpen ? (
              <><X className="mr-1 h-3.5 w-3.5" /> Hide prompt</>
            ) : (
              <><Copy className="mr-1 h-3.5 w-3.5" /> Copy prompt</>
            )}
          </Button>
        </div>
      </div>

      {promptOpen && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              This is the exact prompt Study Lamp would send to generate this roadmap. Copy it, run it in any AI
              assistant, then switch to <strong>Customize</strong> and paste the reply in to use it here.
            </p>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              aria-label="Close prompt"
              title="Close prompt"
              onClick={() => setPromptOpen(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {promptLoading ? (
            <p className="text-xs text-muted-foreground">Building prompt…</p>
          ) : (
            <>
              <Textarea readOnly value={promptText ?? ""} rows={8} className="font-mono text-xs" />
              <Button size="sm" onClick={() => void copyPrompt()}>
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy to clipboard
              </Button>
            </>
          )}
        </div>
      )}

      {mode === "view" ? (
        <RoadmapView roadmap={roadmap} />
      ) : (
        <RoadmapEditor category={category} level={level} roadmap={roadmap} onSaveSteps={onSaveSteps} />
      )}
    </div>
  );
}

// ── Read-only view of the current roadmap's steps. ──

function RoadmapView({ roadmap }: { roadmap: LearningRoadmap | undefined }) {
  if (!roadmap || roadmap.steps.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        No roadmap yet for this level. Use <strong>Generate</strong> above, or switch to{" "}
        <strong>Customize</strong> to write your own.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {roadmap.steps.map((step, index) => (
        <li key={`${roadmap.id}-${index}`} className="flex gap-2 rounded-md border border-border bg-background p-3 text-sm">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-semibold text-accent">
            {step.week ?? index + 1}
          </span>
          <div>
            <div className="font-medium">
              {step.week ? <span className="text-muted-foreground">Week {step.week} — </span> : null}
              {step.title}
            </div>
            {step.description && <p className="text-muted-foreground">{step.description}</p>}
            <StepDetails details={step.details} />
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── A step's bullet list, rendered as a real list when present. ──

function StepDetails({ details }: { details?: string[] }) {
  if (!details || details.length === 0) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
      {details.map((detail, index) => (
        <li key={index}>{detail}</li>
      ))}
    </ul>
  );
}

// ── Editable steps + per-step playlist suggestions + goal suggestions.
// Works whether `roadmap` exists yet or not — on an empty roadmap, the
// first Add step / Import creates it via onSaveSteps. ──

function RoadmapEditor({
  category,
  level,
  roadmap,
  onSaveSteps,
}: {
  category: Category;
  level: RoadmapLevel;
  roadmap: LearningRoadmap | undefined;
  onSaveSteps: (steps: RoadmapStep[]) => void;
}) {
  const { user } = useAuth();
  const steps = roadmap?.steps ?? [];

  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draft, setDraft] = React.useState<{ title: string; description: string; details: string }>({ title: "", description: "", details: "" });

  const [playlistResults, setPlaylistResults] = React.useState<Record<number, YouTubePlaylistSearchResult[]>>({});
  const [playlistLoading, setPlaylistLoading] = React.useState<number | null>(null);
  const [addedPlaylists, setAddedPlaylists] = React.useState<{ id: string; title: string }[]>([]);

  const [goalSuggestions, setGoalSuggestions] = React.useState<GoalSuggestion[] | null>(null);
  const [goalsLoading, setGoalsLoading] = React.useState(false);

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
    setDraft({
      title: step.title,
      description: step.description || "",
      details: (step.details ?? []).join("\n"),
    });
  }

  function commitEdit(index: number) {
    const title = draft.title.trim();
    if (!title) {
      toast.error("A step needs a title.");
      return;
    }
    const details = draft.details.split("\n").map((line) => line.trim()).filter(Boolean);
    const nextSteps = steps.map((step, i) => {
      if (i !== index) return step;
      const { details: _oldDetails, ...rest } = step;
      return details.length > 0
        ? { ...rest, title, description: draft.description.trim(), details }
        : { ...rest, title, description: draft.description.trim() };
    });
    onSaveSteps(nextSteps);
    setEditingIndex(null);
  }

  function removeStep(index: number) {
    onSaveSteps(steps.filter((_, i) => i !== index));
    setPlaylistResults((prev) => {
      const { [index]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function addStep() {
    onSaveSteps([...steps, { title: "New step", description: "", details: [], order: steps.length }]);
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
        steps: steps.map((step) => ({ title: step.title, description: step.description })),
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={addStep}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add step
        </Button>
        <Button size="sm" variant="outline" onClick={() => setImportOpen((v) => !v)}>
          <Import className="mr-1 h-3.5 w-3.5" /> Paste / import roadmap
        </Button>
        <Button size="sm" variant="outline" onClick={() => void suggestGoals()} disabled={goalsLoading || steps.length === 0}>
          <Target className="mr-1 h-3.5 w-3.5" /> {goalsLoading ? "Thinking…" : "Suggest goals from this roadmap"}
        </Button>
      </div>

      {importOpen && (
        <div className="space-y-2 rounded-md border border-border bg-background p-3">
          <p className="text-xs text-muted-foreground">
            Paste a roadmap you already have — JSON (<code>{"[{title, description, week}]"}</code>), the reply from
            another AI you ran the copied prompt on, or a plain numbered list. This replaces the steps below.
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

      {steps.length === 0 && !importOpen && (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          No steps yet — add one manually or paste in a roadmap above.
        </p>
      )}

      <SortableList
        items={steps}
        getId={(step) => String(steps.indexOf(step))}
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
                    <Textarea
                      value={draft.details}
                      onChange={(e) => setDraft((d) => ({ ...d, details: e.target.value }))}
                      placeholder={"One concrete action per line, e.g.\nPractice 10 phrases a day with Anki"}
                      rows={3}
                      className="text-xs"
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
                    <StepDetails details={step.details} />
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