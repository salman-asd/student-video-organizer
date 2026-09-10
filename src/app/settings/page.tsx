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
import { getAiPreferences, updateAiPreferences, type AiPreferences } from "@/lib/aiPreferencesClient";
import type { AiConnectionSummary } from "@/types";
import { Plus, Pencil, Trash2, Sparkles, GripVertical } from "lucide-react";
import { toast } from "sonner";

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

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const [nextConnections, nextPreferences] = await Promise.all([
        listAiConnections(idToken),
        getAiPreferences(idToken),
      ]);
      setConnections(nextConnections);
      setAiPreferences(nextPreferences);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load your AI connections.");
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

  React.useEffect(() => { load(); }, [load]);

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
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h2 className="font-display text-base font-semibold">AI Connections</h2>
                  <p className="text-sm text-muted-foreground">
                    Add your own AI provider key so Study Lamp can generate a starter summary draft for you. Your
                    key is encrypted and stored on Study Lamp's server — it's never sent to any browser, and
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
