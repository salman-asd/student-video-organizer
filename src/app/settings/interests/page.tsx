"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategory, listCategories } from "@/lib/firestore/categoriesTags";
import { getDefaultSubcategoriesForMain, validateCustomInterestName, validateCustomSubtopicName } from "@/lib/defaultTaxonomy";
import { normalizeUserInterests } from "@/lib/userInterests";
import type { Category, UserInterest } from "@/types";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function InterestsSettingsPage() {
  return (
    <RequireAuth>
      <InterestsContent />
    </RequireAuth>
  );
}

function InterestsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [interestCategories, setInterestCategories] = React.useState<Category[]>([]);
  const [selectedInterestIds, setSelectedInterestIds] = React.useState<string[]>([]);
  const [selectedSubtopics, setSelectedSubtopics] = React.useState<Record<string, string[]>>({});
  const [customSubtopicInputs, setCustomSubtopicInputs] = React.useState<Record<string, string>>({});
  const [subtopicSuggestions, setSubtopicSuggestions] = React.useState<Record<string, string | null>>({});
  const [subtopicSuggestionLoading, setSubtopicSuggestionLoading] = React.useState<Record<string, boolean>>({});
  const suggestionTrayRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [customInterestInput, setCustomInterestInput] = React.useState("");
  const [savingInterests, setSavingInterests] = React.useState(false);
  const [savingCustomInterest, setSavingCustomInterest] = React.useState(false);

  const selectedCategories = React.useMemo(
    () => interestCategories.filter((category) => selectedInterestIds.includes(category.id)),
    [interestCategories, selectedInterestIds]
  );

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [nextCategories, profileSnap] = await Promise.all([
        listCategories(user.uid),
        getDoc(doc(db, "users", user.uid)),
      ]);
      const savedInterests = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);

      setInterestCategories(nextCategories);
      setSelectedInterestIds(savedInterests.map((item) => item.categoryId));
      setSelectedSubtopics(Object.fromEntries(savedInterests.map((item) => [item.categoryId, item.subtopics ?? []])));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load your interests.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

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

  async function saveInterests() {
    if (!user) return;
    setSavingInterests(true);
    try {
      const interests = normalizeUserInterests(selectedInterestIds.map((categoryId) => ({
        categoryId,
        level: null,
        subtopics: selectedSubtopics[categoryId] ?? [],
      })));
      await updateDoc(doc(db, "users", user.uid), { interests });
      toast.success("Your interests were saved.");
    } catch (error: any) {
      toast.error(error?.message || "Unable to save your interests.");
    } finally {
      setSavingInterests(false);
    }
  }

  async function addCustomInterest() {
    if (!user) return;
    const validation = validateCustomInterestName(customInterestInput);
    if (!validation.valid) {
      toast.error(validation.reason || "Topic name is invalid.");
      return;
    }

    setSavingCustomInterest(true);
    try {
      const categoryId = await createCategory(validation.normalized, user.uid);
      setSelectedInterestIds((prev) => (prev.includes(categoryId) ? prev : [...prev, categoryId]));
      setCustomInterestInput("");
      toast.success(`${validation.normalized} was added to your interests.`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to add this topic.");
    } finally {
      setSavingCustomInterest(false);
    }
  }

  async function addCustomSubtopic(categoryId: string) {
    const category = selectedCategories.find((item) => item.id === categoryId);
    const value = customSubtopicInputs[categoryId] ?? "";
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

      setSelectedSubtopics((prev) => ({ ...prev, [categoryId]: Array.from(new Set([...(prev[categoryId] ?? []), validation.normalized])) }));
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

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Interests</h1>
          <p className="text-sm text-muted-foreground">Choose your main learning topics and refine them with the most relevant subtopics.</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold">Learning interests</h2>
                <p className="text-sm text-muted-foreground">These power your roadmap and recommendations.</p>
              </div>
              <Link href="/onboarding" className="text-sm font-medium text-accent hover:underline">Review onboarding</Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {loading && <p className="text-sm text-muted-foreground">Loading your topics…</p>}
              {!loading && interestCategories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet — create some in the category settings first.</p>}
              {interestCategories.map((category) => {
                const active = selectedInterestIds.includes(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedInterestIds((prev) => active ? prev.filter((id) => id !== category.id) : [...prev, category.id])}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-accent bg-accent/10 text-accent" : "border-border bg-background text-foreground hover:border-accent/50"}`}
                  >
                    {active ? <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> {category.name}</span> : category.name}
                  </button>
                );
              })}
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
                          <span className="text-xs text-muted-foreground">No default subtopics for this topic yet.</span>
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
                        <Button type="button" variant="outline" onClick={() => void addCustomSubtopic(category.id)} loading={subtopicSuggestionLoading[category.id]} loadingText="Checking…">
                          Add
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
                                ? `Added "${subtopicSuggestions[category.id]}"`
                                : `Add "${subtopicSuggestions[category.id]}" to selected subtopics`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={customInterestInput}
                onChange={(event) => setCustomInterestInput(event.target.value)}
                placeholder="Add a custom topic"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addCustomInterest();
                }}
              />
              <Button onClick={() => void addCustomInterest()} disabled={!customInterestInput.trim()} loading={savingCustomInterest} loadingText="Adding…">
                Add topic
              </Button>
            </div>

            <Button onClick={() => void saveInterests()} disabled={!user} loading={savingInterests} loadingText="Saving…">
              Save interests
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
