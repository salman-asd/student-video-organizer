"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { AiConnectionDialog } from "@/components/settings/AiConnectionDialog";
import { SortableList } from "@/components/dnd/SortableList";
import {
  deleteAiConnection, listAiConnections, reorderAiConnections, testAiConnection, updateAiConnection,
} from "@/lib/aiConnectionsClient";
import { getAiPreferences, getAiQuota, updateAiPreferences, type AiPreferences, type AiQuotaSummary } from "@/lib/aiPreferencesClient";
import type { AiConnectionSummary } from "@/types";
import { Plus, Pencil, Trash2, Sparkles, GripVertical } from "lucide-react";
import { PageInfo } from "@/components/shared/PageInfo";
import { GuideCard, GuideList, GuideSection } from "@/components/shared/GuideCard";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter", groq: "Groq" };

export default function AiConnectionsSettingsPage() {
  return (
    <RequireAuth>
      <AiConnectionsContent />
    </RequireAuth>
  );
}

function AiConnectionsContent() {
  const { user } = useAuth();
  const [connections, setConnections] = React.useState<AiConnectionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingConnection, setEditingConnection] = React.useState<AiConnectionSummary | null>(null);
  const [aiPreferences, setAiPreferences] = React.useState<AiPreferences>({ speechToTextEnabled: false });
  const [aiQuota, setAiQuota] = React.useState<AiQuotaSummary | null>(null);
  const [savingPreference, setSavingPreference] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const [nextConnections, nextPreferences, nextQuota] = await Promise.all([
        listAiConnections(idToken),
        getAiPreferences(idToken),
        getAiQuota(idToken, user.uid),
      ]);
      setConnections(nextConnections);
      setAiPreferences(nextPreferences);
      setAiQuota(nextQuota);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load your AI connections.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

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
    // Optimistic update. getActiveConnectionRaw already skips inactive
    // connections when picking which one to use, so this toggle takes
    // effect on the very next generation request.
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
    setDeletingId(connection.id);
    try {
      const idToken = await user.getIdToken();
      await deleteAiConnection(idToken, connection.id);
      setConnections((prev) => prev.filter((c) => c.id !== connection.id));
      toast.success("Connection deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete connection.");
    } finally {
      setDeletingId(null);
    }
  }

  // Dragging reorders the priority Study Lamp uses to pick a connection
  // (getActiveConnectionRaw) — top of the list is tried first. Optimistic
  // like the toggle above, since a failed reorder is easy to just retry and
  // low-stakes either way.
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
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold">AI Connections</h1>
            <PageInfo title="AI Connections" guideId="ai">
              <p>Add your own AI provider key so summaries, quizzes and roadmaps run on <strong>your</strong> account instead of Study Lamp&apos;s small shared daily allowance.</p>
              <p>You can add several. They are tried <strong>top to bottom</strong>; if one fails or hits its limit, the next one is used automatically.</p>
            </PageInfo>
          </div>
          <p className="text-sm text-muted-foreground">Manage the AI providers Study Lamp uses on your behalf.</p>
        </div>

        <GuideCard id="ai" title="How AI connections work" forceOpen={!loading && connections.length === 0}>
          <GuideSection title="Why add a connection?">
            <GuideList items={[
              <>AI features use it: <strong>starter summaries, quizzes, roadmaps, goal suggestions</strong> and spelling help for topics.</>,
              <>Without one, Study Lamp uses its <strong>shared system AI</strong>, which has a small daily limit for every user (see &quot;System AI usage&quot; below) and may be turned off by an admin.</>,
              <>With your own key you use <strong>your provider&apos;s limits</strong>, not the shared quota — and you choose the model.</>,
              <>Some providers have a <strong>free tier</strong> (for example Google&apos;s Gemini API through Google AI Studio). Limits differ per model and can change, so check your provider&apos;s dashboard. Free tiers may use your prompts to improve their products, so avoid private material.</>,
              <>Your key is <strong>encrypted on Study Lamp&apos;s server</strong> and never sent back to your browser; AI requests are made from the server.</>,
            ]} />
          </GuideSection>

          <GuideSection title="How to add one">
            <GuideList ordered items={[
              <>Create an API key on your provider&apos;s website (Gemini, OpenAI, Anthropic, OpenRouter or Groq). For Gemini, sign in at <a className="font-medium text-accent hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a> and choose &quot;Create API key&quot;. Copy it.</>,
              <>Click <strong>Add Connection</strong>, pick the provider, give it a label you will recognise, and paste the key.</>,
              <>Choose a <strong>model</strong> (use &quot;Refresh models&quot; to load the list your key can access), then save.</>,
              <>Press <strong>Test</strong> on the new row to confirm it works.</>,
            ]} />
          </GuideSection>

          <GuideSection title="Using more than one (and how fallback works)">
            <GuideList items={[
              <>Connections are used in list order: <strong>#1 first</strong>, then #2, and so on. Only connections that are <strong>enabled</strong>, not <strong>Invalid key</strong> and not in <strong>Cooldown</strong> are considered.</>,
              <>If the one being used fails because the key was rejected, the provider&apos;s <strong>rate limit or quota</strong> was reached, or it timed out / had a network or server error, Study Lamp <strong>automatically tries the next one</strong> for that same request — you just get your result.</>,
              <>A rejected key becomes <strong>Invalid key</strong> and is skipped until you fix it (edit the key, or Test it successfully). A rate limit puts it in <strong>Cooldown for about a minute</strong>, then it is tried again on its own.</>,
              <>Other problems (for example a request the provider refuses) are shown to you instead of being retried elsewhere.</>,
              <>If <strong>none</strong> of your connections can be used, Study Lamp falls back to the shared <strong>system AI</strong> (daily limit, if enabled). If that is unavailable too, you get a message asking you to add or fix a key.</>,
              <>Good setup: your favourite/cheapest provider at #1, a second provider at #2 as a safety net.</>,
            ]} />
          </GuideSection>

          <GuideSection title="Reorder, disable, test, edit">
            <GuideList items={[
              <><strong>Reorder:</strong> drag the grip handle (⋮⋮) on a row. The top row is #1; the new order is saved immediately.</>,
              <><strong>Disable:</strong> the switch skips a connection without deleting it — handy for a backup you only want sometimes.</>,
              <><strong>Test:</strong> runs a light check with the saved key (it does not generate anything, so it barely uses quota). Passed → <em>Active</em>; the provider rejects the key → <em>Invalid key</em>; a network hiccup changes nothing. It checks the <em>key</em>, not whether your chosen model still has quota.</>,
              <><strong>Edit:</strong> change the label or model, or refresh the model list, without re-entering the key. Leave the key box empty to keep the stored key; paste a new one to replace it.</>,
              <><strong>Delete</strong> removes the connection and its stored key.</>,
            ]} />
          </GuideSection>
        </GuideCard>

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
              <div className="space-y-1 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No AI connections yet</p>
                <p>You&apos;re using Study Lamp&apos;s shared AI, which has a small daily limit. Click <strong>Add Connection</strong>, paste a key from your AI provider, then press <strong>Test</strong>.</p>
              </div>
            )}

            {!loading && connections.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Drag to reorder. Study Lamp uses the top usable connection first and falls back down the list if it fails.
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span {...dragHandleProps} className="cursor-grab p-1 text-muted-foreground" aria-label="Drag to reorder">
                            <GripVertical className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Drag to change priority — #1 is tried first</TooltipContent>
                      </Tooltip>
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleTest(connection)}
                              loading={testingId === connection.id}
                              loadingText="Testing…"
                            >
                              Test
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">Checks that the saved key works. Doesn&apos;t generate anything.</TooltipContent>
                      </Tooltip>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(connection)} aria-label="Edit connection">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(connection)} aria-label="Delete connection" loading={deletingId === connection.id}>
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
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-semibold">System AI usage</h2>
                <p className="mt-1 text-sm text-muted-foreground">System-provided AI requests reset daily. This shared allowance is only used when none of your own connections can be used. Your own connections never count against it.</p>
              </div>
              <Badge variant={aiQuota?.systemAiEnabled ? "success" : "destructive"}>
                {aiQuota?.systemAiEnabled ? "Available" : "Disabled"}
              </Badge>
            </div>
            {aiQuota && (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span>Used today</span>
                <span className="font-medium">{aiQuota.usedToday} / {aiQuota.dailyLimit}</span>
              </div>
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

const STATUS_HELP = {
  active: "Working. Used in list order.",
  invalid: "The provider rejected this key, so it's skipped. Edit the key or press Test to bring it back.",
  cooldown: "Hit a rate limit. Skipped for about a minute, then tried again automatically.",
} as const;

function StatusBadge({ status }: { status: AiConnectionSummary["status"] }) {
  const badge =
    status === "active" ? <Badge variant="success">Active</Badge>
    : status === "invalid" ? <Badge variant="destructive">Invalid key</Badge>
    : <Badge variant="outline">Cooldown</Badge>;
  const help = STATUS_HELP[status === "active" || status === "invalid" ? status : "cooldown"];
  return (
    <Tooltip>
      <TooltipTrigger asChild><span className="cursor-help">{badge}</span></TooltipTrigger>
      <TooltipContent className="max-w-xs">{help}</TooltipContent>
    </Tooltip>
  );
}
