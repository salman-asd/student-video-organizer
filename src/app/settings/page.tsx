"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AiConnectionDialog } from "@/components/settings/AiConnectionDialog";
import { SortableList } from "@/components/dnd/SortableList";
import {
  deleteAiConnection, listAiConnections, reorderAiConnections, testAiConnection, updateAiConnection,
} from "@/lib/aiConnectionsClient";
import { getAiPreferences, updateAiPreferences, type AiPreferences } from "@/lib/aiPreferencesClient";
import { createCategory, listCategories } from "@/lib/firestore/categoriesTags";
import { getDefaultSubcategoriesForMain, validateCustomInterestName, validateCustomSubtopicName } from "@/lib/defaultTaxonomy";
import { normalizeUserInterests } from "@/lib/userInterests";
import type { AiConnectionSummary, Category, UserInterest } from "@/types";
import { Plus, Pencil, Trash2, Sparkles, GripVertical, Check } from "lucide-react";
import { toast } from "sonner";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter", groq: "Groq" };

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const [connections, setConnections] = React.useState<AiConnectionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingConnection, setEditingConnection] = React.useState<AiConnectionSummary | null>(null);
  const [aiPreferences, setAiPreferences] = React.useState<AiPreferences>({ speechToTextEnabled: false });
  const [savingPreference, setSavingPreference] = React.useState(false);
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
      const idToken = await user.getIdToken();
      const [nextConnections, nextPreferences, nextCategories, profileSnap] = await Promise.all([
        listAiConnections(idToken),
        getAiPreferences(idToken),
        listCategories(user.uid),
        getDoc(doc(db, "users", user.uid)),
      ]);
      const savedInterests = normalizeUserInterests(((profileSnap.data() as any)?.interests ?? []) as UserInterest[]);

      setConnections(nextConnections);
      setAiPreferences(nextPreferences);
      setInterestCategories(nextCategories);
      setSelectedInterestIds(savedInterests.map((item) => item.categoryId));
      setSelectedSubtopics(Object.fromEntries(savedInterests.map((item) => [item.categoryId, item.subtopics ?? []])));
    } catch (error: any) {
      toast.error(error?.message || "Failed to load your settings.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  async function handleSpeechToTextChange(enabled: boolean) {
    if (!user) return;
    const previous = aiPreferences;
    setAiPreferences({ speechToTextEnabled: enabled });
    setSavingPreference(true);
    try {
      const idToken = await user.getIdToken();
      setAiPreferences(await updateAiPreferences(idToken, { speechToTextEnabled: enabled }));
    } catch (error: any) {
      setAiPreferences(previous);
      toast.error(error?.message || "Unable to update AI preferences.");
    } finally {
      setSavingPreference(false);
    }
  }

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

  function openCreate() {
    setEditingConnection(null);
    setDialogOpen(true);
  }

  function openEdit(connection: AiConnectionSummary) {
    setEditingConnection(connection);
    setDialogOpen(true);
  }

  function handleSaved(saved: AiConnectionSummary) {
    setConnections((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
  }

  async function handleToggleActive(connection: AiConnectionSummary) {
    if (!user) return;
    const nextActive = !connection.isActive;
    // Optimistic update. getActiveConnectionRaw (Phase 5) already skips
    // inactive connections when picking which one to use, so this toggle
    // takes effect on the very next generation request.
    setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, isActive: nextActive } : c)));
    try {
      const idToken = await user.getIdToken();
      await updateAiConnection(idToken, connection.id, { isActive: nextActive });
    } catch (error: any) {
      setConnections((prev) => prev.map((c) => (c.id === connection.id ? connection : c)));
      toast.error(error?.message || "Failed to update connection.");
    }
  }

  async function handleTest(connection: AiConnectionSummary) {
    if (!user) return;
    setTestingId(connection.id);
    try {
      const idToken = await user.getIdToken();
      const result = await testAiConnection(idToken, connection.id);
      if (result.success) {
        toast.success(result.message || "Connection verified.");
        setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, status: "active" } : c)));
      } else {
        toast.error(result.message || "This connection isn't working.");
        if (result.message.endsWith("rejected this API key.")) {
          setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, status: "invalid" } : c)));
        }
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to test connection.");
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(connection: AiConnectionSummary) {
    if (!user) return;
    if (!confirm(`Delete "${connection.label}"? This can't be undone.`)) return;
    try {
      const idToken = await user.getIdToken();
      await deleteAiConnection(idToken, connection.id);
      setConnections((prev) => prev.filter((c) => c.id !== connection.id));
      toast.success("Connection deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete connection.");
    }
  }

  // Phase 6: dragging reorders the priority Study Lamp uses to pick a
  // connection (getActiveConnectionRaw, Phase 5) — top of the list is tried
  // first. Optimistic like the toggle above, since a failed reorder is easy
  // to just retry and low-stakes either way.
  async function handleReorder(newOrder: AiConnectionSummary[]) {
    if (!user) return;
    const previous = connections;
    setConnections(newOrder);
    try {
      const idToken = await user.getIdToken();
      await reorderAiConnections(idToken, newOrder.map((c) => c.id));
    } catch (error: any) {
      setConnections(previous);
      toast.error(error?.message || "Failed to save the new order.");
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and integrations.</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
              <h2 className="font-display text-base font-semibold">Learning interests</h2>
              <p className="text-sm text-muted-foreground">Choose your main learning topics and refine them with the most relevant subtopics.</p>
              </div>
              <Link href="/onboarding" className="text-sm font-medium text-accent hover:underline">Review onboarding</Link>
            </div>

            <div className="flex flex-wrap gap-2">
              {interestCategories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet — create some in the category settings first.</p>}
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

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={customInterestInput}
                onChange={(event) => setCustomInterestInput(event.target.value)}
                placeholder="Add a custom topic"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addCustomInterest();
                }}
              />
              <Button onClick={() => void addCustomInterest()} disabled={savingCustomInterest || !customInterestInput.trim()}>
                {savingCustomInterest ? "Adding…" : "Add topic"}
              </Button>
            </div>

            <Button onClick={() => void saveInterests()} disabled={savingInterests || !user}>
              {savingInterests ? "Saving…" : "Save interests"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h2 className="font-display text-base font-semibold">AI Connections</h2>
                  <p className="text-sm text-muted-foreground">
                    Add your own AI provider key so Study Lamp can generate a starter summary draft for you. Your
                    key is encrypted and stored on Study Lamp&apos;s server — it&apos;s never sent to any browser, and
                    AI requests are made from the server, not your device.
                  </p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Add Connection
              </Button>
            </div>

            {loading && (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {!loading && connections.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No AI connections yet. Add an AI provider key to enable starter summaries.
              </p>
            )}

            {!loading && connections.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Drag to reorder. Study Lamp uses the top usable connection in this list for each request.
              </p>
            )}

            {!loading && (
              <SortableList
                items={connections}
                getId={(c) => c.id}
                onReorder={handleReorder}
                className="space-y-2"
                renderItem={(connection, dragHandleProps, index) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span {...dragHandleProps} className="cursor-grab p-1 text-muted-foreground" aria-label="Drag to reorder">
                        <GripVertical className="h-4 w-4" />
                      </span>
                      <Badge variant="outline" className="shrink-0 font-mono">#{index + 1}</Badge>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{connection.label}</span>
                          <Badge variant="outline">{PROVIDER_LABELS[connection.provider] || connection.provider}</Badge>
                          <StatusBadge status={connection.status} />
                          {!connection.isActive && <Badge variant="secondary">Disabled</Badge>}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {connection.model} · Key: {connection.maskedKey}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={connection.isActive}
                        onCheckedChange={() => handleToggleActive(connection)}
                        aria-label={connection.isActive ? "Disable connection" : "Enable connection"}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(connection)}
                        disabled={testingId === connection.id}
                      >
                        {testingId === connection.id ? "Testing..." : "Test"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(connection)} aria-label="Edit connection">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(connection)} aria-label="Delete connection">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start justify-between gap-4 p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Speech-to-text fallback</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Allow AI to use audio transcription when YouTube captions are unavailable. This is opt-in and requires a configured transcription service.
              </p>
            </div>
            <Switch
              checked={aiPreferences.speechToTextEnabled}
              onCheckedChange={handleSpeechToTextChange}
              disabled={savingPreference}
              aria-label="Enable speech-to-text fallback"
            />
          </CardContent>
        </Card>
      </div>

      <AiConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={editingConnection}
        onSaved={handleSaved}
      />
    </AppShell>
  );
}

function StatusBadge({ status }: { status: AiConnectionSummary["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "invalid") return <Badge variant="destructive">Invalid key</Badge>;
  return <Badge variant="outline">Cooldown</Badge>;
}
