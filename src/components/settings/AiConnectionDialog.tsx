"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";
import { createAiConnection, updateAiConnection } from "@/lib/aiConnectionsClient";
import { AI_PROVIDERS } from "@/types";
import type { AiProvider } from "@/types";
import type { AiConnectionSummary } from "@/types";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  groq: "Groq",
};

export function AiConnectionDialog({
  open, onOpenChange, connection, onSaved,
  createConnection = async (idToken, input) => createAiConnection(idToken, input),
  updateConnection = async (idToken, id, input) => updateAiConnection(idToken, id, input),
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit that connection. Absent → create a new one. */
  connection?: AiConnectionSummary | null;
  onSaved: (connection: AiConnectionSummary) => void;
  createConnection?: typeof createAiConnection;
  updateConnection?: typeof updateAiConnection;
}) {
  const { user } = useAuth();
  const isEdit = !!connection;

  const [apiKey, setApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [model, setModel] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [provider, setProvider] = React.useState<AiProvider>("gemini");
  const [saving, setSaving] = React.useState(false);

  // Re-seed the form whenever a different connection is opened for editing
  // (or the dialog opens for "create"). The API key field always starts
  // blank on edit — the server never sends it back, encrypted or otherwise.
  React.useEffect(() => {
    if (!open) return;
    setApiKey("");
    setShowApiKey(false);
    setModel(connection?.model || "");
    setLabel(connection?.label || "");
    setProvider(connection?.provider || "gemini");
    setSaving(false);
  }, [open, connection]);

  const canSubmit = model.trim() && label.trim() && (isEdit || apiKey.trim());

  async function handleSave() {
    if (!user || !canSubmit) return;
    setSaving(true);
    try {
      const idToken = await user.getIdToken();
      const saved = isEdit && connection
        ? await updateConnection(idToken, connection.id, {
            model: model.trim(),
            label: label.trim(),
            ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          })
        : await createConnection(idToken, {
            provider,
            apiKey: apiKey.trim(),
            model: model.trim(),
            label: label.trim(),
          });
      toast.success(isEdit ? "Connection updated" : "Connection added");
      onSaved(saved);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Unable to save this connection.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit AI Connection" : "Add AI Connection"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Provider</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as AiProvider)}
              disabled={isEdit}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {AI_PROVIDERS.map((option) => (
                <option key={option} value={option}>
                  {PROVIDER_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-connection-label">Label</Label>
            <Input
              id="ai-connection-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`e.g. My ${PROVIDER_LABELS[provider]} key`}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-connection-model">Model</Label>
            <Input
              id="ai-connection-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "gemini" ? "e.g. gemini-2.0-flash" : provider === "openai" ? "e.g. gpt-4o-mini" : provider === "anthropic" ? "e.g. claude-3-5-sonnet-latest" : provider === "openrouter" ? "e.g. meta-llama/llama-3.1-8b-instruct:free" : "e.g. llama-3.3-70b-versatile"}
            />
            <p className="text-xs text-muted-foreground">
              The exact {PROVIDER_LABELS[provider]} model name to use.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-connection-key">API Key</Label>
            <div className="relative">
              <Input
                id="ai-connection-key"
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isEdit ? "Leave blank to keep the current key" : `Paste your ${PROVIDER_LABELS[provider]} API key`}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              This is sent to Study Lamp&apos;s server once, encrypted, and stored — it&apos;s never sent back to any
              browser, including yours. Requests using this key are sent from Study Lamp&apos;s server, not
              your browser.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !canSubmit}>
            {saving ? "Saving..." : isEdit ? "Save changes" : "Add connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
