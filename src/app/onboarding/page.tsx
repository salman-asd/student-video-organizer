"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createCategory, listCategories } from "@/lib/firestore/categoriesTags";
import { db } from "@/lib/firebase";
import { getDefaultSubcategoriesForMain, validateCustomInterestName, validateCustomSubtopicName } from "@/lib/defaultTaxonomy";
import { normalizeUserInterests } from "@/lib/userInterests";
import type { Category, UserInterest } from "@/types";
import { ChevronRight, Check } from "lucide-react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { toast } from "sonner";
import { buildInterestSuggestion } from "@/lib/userInterests";

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = React.useState<Record<string, string[]>>({});
  const [customSubtopicInputs, setCustomSubtopicInputs] = React.useState<Record<string, string>>({});
  const [subtopicSuggestions, setSubtopicSuggestions] = React.useState<Record<string, string | null>>({});
  const [subtopicSuggestionLoading, setSubtopicSuggestionLoading] = React.useState<Record<string, boolean>>({});
  const [otherInput, setOtherInput] = React.useState("");
  const [otherMode, setOtherMode] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [suggestedName, setSuggestedName] = React.useState<string | null>(null);
  const [suggestedCategoryId, setSuggestedCategoryId] = React.useState<string | null>(null);
  const [suggestionLoading, setSuggestionLoading] = React.useState(false);
  const suggestionTrayRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const selectedCategories = React.useMemo(
    () => categories.filter((category) => selected.includes(category.id)),
    [categories, selected]
  );

  React.useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const nextCategories = await listCategories(user.uid);
        setCategories(nextCategories);
        const snap = await getDoc(doc(db, "users", user.uid));
        const saved = normalizeUserInterests(((snap.data() as any)?.interests ?? []) as UserInterest[]);
        setSelected(saved.map((item) => item.categoryId));
        setSelectedSubtopics(Object.fromEntries(saved.map((item) => [item.categoryId, item.subtopics ?? []])));
      } catch (error) {
        console.error("Unable to load onboarding categories", error);
      }
    })();
  }, [user]);

  React.useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      for (const [categoryId, ref] of Object.entries(suggestionTrayRefs.current)) {
        if (ref && !ref.contains(event.target as Node)) {
          setSubtopicSuggestions((prev) => ({ ...prev, [categoryId]: null }));
        }
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  async function resolveOtherSuggestion() {
    const trimmed = otherInput.trim();
    if (!user || !trimmed) return;

    const validation = validateCustomInterestName(trimmed);
    if (!validation.valid) {
      toast.error(validation.reason || "Topic name is invalid.");
      return;
    }

    setSuggestionLoading(true);
    setSuggestedName(null);
    setSuggestedCategoryId(null);
    try {
      const response = await fetch("/api/ai/suggest-category-name", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ otherText: validation.normalized }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to suggest a category.");

      const suggestion = payload.suggestion ?? {};
      const built = buildInterestSuggestion(String(suggestion.cleanedName ?? validation.normalized), categories);
      setSuggestedName(built.cleanedName || suggestion.cleanedName || validation.normalized);
      setSuggestedCategoryId(built.matchingCategoryId ?? null);

      if (built.isDuplicate && built.matchingCategoryId) {
        toast.info(`This looks like “${built.matchingCategoryName}”. Use that instead.`);
      } else if (suggestion.cleanedName) {
        toast.success(`Did you mean “${suggestion.cleanedName}”?`);
      }
    } catch (error: any) {
      toast.error(error?.message || "Unable to suggest a category.");
    } finally {
      setSuggestionLoading(false);
    }
  }

  async function addCustomSubtopic(categoryId: string) {
    const value = customSubtopicInputs[categoryId] ?? "";
    const category = selectedCategories.find((item) => item.id === categoryId);
    const knownSubtopics = category ? getDefaultSubcategoriesForMain(category.name) : [];
    const validation = validateCustomInterestName(value);
    if (!validation.valid) {
      toast.error(validation.reason || "Subtopic name is invalid.");
      return;
    }

    if (knownSubtopics.some((topic) => topic.toLowerCase() === validation.normalized.toLowerCase())) {
      toast.error("Select this subtopic from the suggestions instead of adding a duplicate.");
      return;
    }

    setSubtopicSuggestionLoading((prev) => ({ ...prev, [categoryId]: true }));
    try {
      const response = await fetch("/api/ai/suggest-category-name", {
        method: "POST",
        headers: { Authorization: `Bearer ${await user!.getIdToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ otherText: validation.normalized, contextName: category?.name, candidateSubtopics: knownSubtopics }),
      });
      const payload = await response.json().catch(() => ({}));
      const suggestion = String(payload?.suggestion?.cleanedName ?? "").trim();
      if (response.ok && suggestion && suggestion.toLowerCase() !== validation.normalized.toLowerCase()) {
        setSubtopicSuggestions((prev) => ({ ...prev, [categoryId]: suggestion }));
        toast.info("Please review the spelling suggestion before adding this subtopic.");
        return;
      }
      if (!response.ok && !validateCustomSubtopicName(value, knownSubtopics).valid) {
        toast.error(validateCustomSubtopicName(value, knownSubtopics).reason || "Please correct the subtopic spelling.");
        return;
      }

      setSelectedSubtopics((prev) => ({
        ...prev,
        [categoryId]: Array.from(new Set([...(prev[categoryId] ?? []), validation.normalized])),
      }));
      setCustomSubtopicInputs((prev) => ({ ...prev, [categoryId]: "" }));
      setSubtopicSuggestions((prev) => ({ ...prev, [categoryId]: null }));
    } catch {
      const fallback = validateCustomSubtopicName(value, knownSubtopics);
      if (!fallback.valid) {
        toast.error(fallback.reason || "Please correct the subtopic spelling.");
        return;
      }
      setSelectedSubtopics((prev) => ({ ...prev, [categoryId]: Array.from(new Set([...(prev[categoryId] ?? []), validation.normalized])) }));
      setCustomSubtopicInputs((prev) => ({ ...prev, [categoryId]: "" }));
    } finally {
      setSubtopicSuggestionLoading((prev) => ({ ...prev, [categoryId]: false }));
    }
  }

  async function handleSave() {
    if (!user) return;

    if (otherInput.trim()) {
      const validation = validateCustomInterestName(otherInput);
      if (!validation.valid) {
        toast.error(validation.reason || "Topic name is invalid.");
        return;
      }
    }

    setSaving(true);
    try {
      let customCategoryId: string | null = suggestedCategoryId;
      if (otherInput.trim() && !customCategoryId) {
        const validation = validateCustomInterestName(otherInput);
        customCategoryId = await createCategory(suggestedName || validation.normalized, user.uid);
      }

      const categoryIds = customCategoryId && !selected.includes(customCategoryId)
        ? [...selected, customCategoryId]
        : selected;
      const next = normalizeUserInterests(
        categoryIds.map((categoryId) => ({
          categoryId,
          level: null,
          subtopics: selectedSubtopics[categoryId] ?? [],
        }))
      );
      await updateDoc(doc(db, "users", user.uid), { interests: next });
      toast.success("Your interests were saved.");
      router.replace("/dashboard");
    } catch (error: any) {
      toast.error(error?.message || "Unable to save your interests.");
    } finally {
      setSaving(false);
    }
  }

  const allSelected = selected.length > 0 || !!otherInput.trim();

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-accent">Welcome</p>
          <h1 className="font-display text-3xl font-semibold">Choose the topics you want to learn</h1>
          <p className="text-muted-foreground">Pick a few categories so Study Lamp can personalize your dashboard and recommendations.</p>
        </div>

        <Card>
          <CardContent className="space-y-5 p-5">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories are available yet. Add some from settings or create a few to get started.</p>}
                {categories.map((category) => {
                  const active = selected.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => setSelected((prev) => active ? prev.filter((id) => id !== category.id) : [...prev, category.id])}
                      className={`rounded-full border px-3 py-2 text-sm transition ${active ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground hover:border-accent/50"}`}
                    >
                      {active ? <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> {category.name}</span> : category.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setOtherMode((prev) => !prev)}
                  className={`rounded-full border px-3 py-2 text-sm transition ${otherMode ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground hover:border-accent/50"}`}
                >
                  {otherMode ? "Close Other" : "Other"}
                </button>
              </div>

              {selectedCategories.length > 0 && (
                <div className="space-y-3 rounded-xl border border-dashed border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium text-foreground">Suggested subtopics</p>
                  {selectedCategories.map((category) => {
                    const subtopics = getDefaultSubcategoriesForMain(category.name);
                    return (
                      <div key={category.id} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{category.name}</p>
                        <div className="flex flex-wrap gap-2">
                          {(selectedSubtopics[category.id] ?? []).filter((topic) => !subtopics.includes(topic)).map((topic) => (
                            <button
                              key={`${category.id}-custom-${topic}`}
                              type="button"
                              onClick={() => setSelectedSubtopics((prev) => ({ ...prev, [category.id]: (prev[category.id] ?? []).filter((item) => item !== topic) }))}
                              className="rounded-full border border-accent bg-accent/10 px-2.5 py-1.5 text-xs text-accent"
                              title="Remove custom subtopic"
                            >
                              {topic} ×
                            </button>
                          ))}
                          {subtopics.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No default subtopics for this category yet.</span>
                          ) : (
                            subtopics.map((subtopic) => (
                              <button
                                key={`${category.id}-${subtopic}`}
                                type="button"
                                  onClick={() => setSelectedSubtopics((prev) => {
                                    const current = prev[category.id] ?? [];
                                    return {
                                      ...prev,
                                      [category.id]: current.includes(subtopic)
                                        ? current.filter((item) => item !== subtopic)
                                        : [...current, subtopic],
                                    };
                                  })}
                                  className={`rounded-full border px-2.5 py-1.5 text-xs transition ${selectedSubtopics[category.id]?.includes(subtopic) ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground hover:border-accent hover:text-accent"}`}
                              >
                                  {selectedSubtopics[category.id]?.includes(subtopic) && <Check className="mr-1 inline h-3 w-3" />}
                                  {subtopic}
                              </button>
                            ))
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={customSubtopicInputs[category.id] ?? ""}
                            onChange={(event) => setCustomSubtopicInputs((prev) => ({ ...prev, [category.id]: event.target.value }))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                if (!subtopicSuggestionLoading[category.id]) void addCustomSubtopic(category.id);
                              }
                            }}
                            placeholder="Other subtopic"
                          />
                          <Button type="button" variant="outline" onClick={() => void addCustomSubtopic(category.id)} disabled={subtopicSuggestionLoading[category.id]}>
                            {subtopicSuggestionLoading[category.id] ? "Checking…" : "Add"}
                          </Button>
                        </div>
                        {(subtopicSuggestionLoading[category.id] || subtopicSuggestions[category.id]) && (
                          <div
                            ref={(element) => { suggestionTrayRefs.current[category.id] = element; }}
                            className="rounded-md border border-accent/30 bg-accent/5 p-2 text-xs text-accent"
                          >
                            {subtopicSuggestionLoading[category.id] ? "Checking spelling…" : (
                              <button
                                type="button"
                                className="font-medium hover:underline"
                                onClick={() => {
                                  const suggestion = subtopicSuggestions[category.id];
                                  if (!suggestion) return;
                                  setSelectedSubtopics((prev) => ({
                                    ...prev,
                                    [category.id]: Array.from(new Set([...(prev[category.id] ?? []), suggestion])),
                                  }));
                                  setCustomSubtopicInputs((prev) => ({ ...prev, [category.id]: "" }));
                                }}
                              >
                                {selectedSubtopics[category.id]?.includes(subtopicSuggestions[category.id] ?? "")
                                  ? `Added “${subtopicSuggestions[category.id]}”`
                                  : `Add “${subtopicSuggestions[category.id]}” to selected subtopics`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {otherMode && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tell us another topic</label>
                <div className="flex gap-2">
                  <Input
                    value={otherInput}
                    onChange={(event) => setOtherInput(event.target.value)}
                    onBlur={() => void resolveOtherSuggestion()}
                    placeholder="e.g. Computer vision"
                  />
                  <Button type="button" variant="secondary" onClick={() => void resolveOtherSuggestion()} disabled={suggestionLoading || !otherInput.trim()}>
                    {suggestionLoading ? "Checking…" : "Check"}
                  </Button>
                </div>
                {suggestedName && (
                  <p className="text-sm text-accent">
                    {suggestedCategoryId ? `This looks like “${suggestedName}” — we’ll use that matching category.` : `Did you mean “${suggestedName}”? This suggestion will be reviewed before becoming a category.`}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => void handleSave()} disabled={!allSelected || saving}>
                {saving ? "Saving…" : "Continue"}
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
