"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AiConnectionDialog } from "@/components/settings/AiConnectionDialog";
import { SortableList } from "@/components/dnd/SortableList";
import { GripVertical, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { AiConnectionSummary } from "@/types";
import { listAiConnections, createAiConnection, updateAiConnection, deleteAiConnection, testAiConnection, type UpdateAiConnectionInput } from "@/lib/aiConnectionsClient";
import { useAuth } from "@/components/auth/AuthProvider";

const PROVIDER_LABELS: Record<string, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Anthropic", openrouter: "OpenRouter", groq: "Groq" };

async function fetchSystemConnections(idToken: string): Promise<AiConnectionSummary[]> {
  const res = await fetch("/api/ai/system-connections", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load system AI connections.");
  return data.connections as AiConnectionSummary[];
}

async function createSystemConnection(idToken: string, input: { provider: string; apiKey: string; model: string; label: string }): Promise<AiConnectionSummary> {
  const res = await fetch("/api/ai/system-connections", {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to save system AI connection.");
  return data.connection as AiConnectionSummary;
}

async function updateSystemConnection(idToken: string, id: string, input: UpdateAiConnectionInput): Promise<AiConnectionSummary> {
  const res = await fetch(`/api/ai/system-connections/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update system AI connection.");
  return data.connection as AiConnectionSummary;
}

async function deleteSystemConnection(idToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/ai/system-connections/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to delete system AI connection.");
}

async function testSystemConnection(idToken: string, id: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`/api/ai/system-connections/${id}/test`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to test system AI connection.");
  return { success: !!data.success, message: data.message || "" };
}

async function fetchSystemDefaults(idToken: string): Promise<{ defaultDailyLimit: number }> {
  const res = await fetch("/api/ai/system-settings", {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load AI defaults.");
  return data.defaults as { defaultDailyLimit: number };
}

async function updateSystemDefaults(idToken: string, value: number): Promise<{ defaultDailyLimit: number }> {
  const res = await fetch("/api/ai/system-settings", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ defaultDailyLimit: value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to update AI defaults.");
  return data.defaults as { defaultDailyLimit: number };
}

export default function AdminAiSettingsPage() {
  return (
    <RequireAdmin>
      <AdminAiSettingsContent />
    </RequireAdmin>
  );
}

function AdminAiSettingsContent() {
  const { user } = useAuth();
  const [connections, setConnections] = React.useState<AiConnectionSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [defaultDailyLimit, setDefaultDailyLimit] = React.useState(5);
  const [savingDefaults, setSavingDefaults] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AiConnectionSummary | null>(null);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      const [nextConnections, defaults] = await Promise.all([
        fetchSystemConnections(idToken),
        fetchSystemDefaults(idToken),
      ]);
      setConnections(nextConnections);
      setDefaultDailyLimit(defaults.defaultDailyLimit);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load system AI settings.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  const handleSaved = (saved: AiConnectionSummary) => {
    setConnections((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
  };

  async function handleDelete(connection: AiConnectionSummary) {
    if (!user) return;
    if (!confirm(`Delete "${connection.label}"? This can't be undone.`)) return;
    try {
      const idToken = await user.getIdToken();
      await deleteSystemConnection(idToken, connection.id);
      setConnections((prev) => prev.filter((c) => c.id !== connection.id));
      toast.success("System connection deleted");
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete system connection.");
    }
  }

  async function handleTest(connection: AiConnectionSummary) {
    if (!user) return;
    setTestingId(connection.id);
    try {
      const idToken = await user.getIdToken();
      const result = await testSystemConnection(idToken, connection.id);
      if (result.success) {
        toast.success(result.message || "Connection verified.");
        setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, status: "active" } : c)));
      } else {
        toast.error(result.message || "This connection isn’t working.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to test connection.");
    } finally {
      setTestingId(null);
    }
  }

  async function handleSaveDefaults() {
    if (!user) return;
    setSavingDefaults(true);
    try {
      const idToken = await user.getIdToken();
      const next = await updateSystemDefaults(idToken, defaultDailyLimit);
      setDefaultDailyLimit(next.defaultDailyLimit);
      toast.success("Default AI quota updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save the default quota.");
    } finally {
      setSavingDefaults(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">Manage the shared system AI connections and the default daily quota.</p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <h2 className="font-display text-base font-semibold">System AI connections</h2>
                  <p className="text-sm text-muted-foreground">These shared keys are used for the admin-controlled fallback tier when students don’t have their own API key.</p>
                </div>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4" /> Add connection
              </Button>
            </div>

            {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!loading && connections.length === 0 && (
              <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No shared AI connections configured yet.
              </p>
            )}

            {!loading && connections.length > 0 && (
              <SortableList
                items={connections}
                getId={(c) => c.id}
                onReorder={(newOrder) => setConnections(newOrder)}
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
                        <p className="truncate text-xs text-muted-foreground">{connection.model} · Key: {connection.maskedKey}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleTest(connection)} disabled={testingId === connection.id}>
                        {testingId === connection.id ? "Testing..." : "Test"}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(connection); setDialogOpen(true); }} aria-label="Edit connection">
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
          <CardContent className="space-y-4 p-4">
            <div>
              <h2 className="font-display text-base font-semibold">Default platform quota</h2>
              <p className="mt-1 text-sm text-muted-foreground">This is the default daily system AI limit assigned to each student when they have no custom override.</p>
            </div>
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="default-daily-limit">Daily limit</Label>
              <Input
                id="default-daily-limit"
                type="number"
                min={0}
                step={1}
                value={defaultDailyLimit}
                onChange={(e) => setDefaultDailyLimit(Number(e.target.value) || 0)}
              />
            </div>
            <Button onClick={handleSaveDefaults} disabled={savingDefaults}> {savingDefaults ? "Saving…" : "Save default"} </Button>
          </CardContent>
        </Card>
      </div>

      <AiConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        connection={editing}
        onSaved={handleSaved}
        createConnection={async (idToken, input) => createSystemConnection(idToken, input)}
        updateConnection={async (idToken, id, input) => updateSystemConnection(idToken, id, input)}
      />
    </AppShell>
  );
}

function StatusBadge({ status }: { status: AiConnectionSummary["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "invalid") return <Badge variant="destructive">Invalid key</Badge>;
  return <Badge variant="outline">Cooldown</Badge>;
}
