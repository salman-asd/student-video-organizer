"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";

import { useAuth } from "@/components/auth/AuthProvider";

import {
  createAiConnection,
  updateAiConnection,
  fetchAiModels,
} from "@/lib/aiConnectionsClient";

import { AI_PROVIDERS } from "@/types";

import type { AiProvider } from "@/types";
import type { AiConnectionSummary } from "@/types";
import type { AiModel } from "@/lib/aiConnectionsClient";

import {
  Eye,
  EyeOff,
} from "lucide-react";

import { toast } from "sonner";

// ---------------------------------------------------------
// Provider labels
// ---------------------------------------------------------

const PROVIDER_LABELS: Record<
  AiProvider,
  string
> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  groq: "Groq",
};

// ---------------------------------------------------------
// Component
// ---------------------------------------------------------

export function AiConnectionDialog({
  open,
  onOpenChange,
  connection,
  onSaved,

  createConnection = async (
    idToken,
    input
  ) =>
    createAiConnection(
      idToken,
      input
    ),

  updateConnection = async (
    idToken,
    id,
    input
  ) =>
    updateAiConnection(
      idToken,
      id,
      input
    ),
}: {
  open: boolean;

  onOpenChange: (
    open: boolean
  ) => void;

  /**
   * Present → edit that connection.
   * Absent → create a new one.
   */
  connection?:
    | AiConnectionSummary
    | null;

  onSaved: (
    connection: AiConnectionSummary
  ) => void;

  createConnection?: typeof createAiConnection;

  updateConnection?: typeof updateAiConnection;
}) {
  const { user } = useAuth();

  const isEdit = !!connection;

  // -------------------------------------------------------
  // Form state
  // -------------------------------------------------------

  const [apiKey, setApiKey] =
    React.useState("");

  const [showApiKey, setShowApiKey] =
    React.useState(false);

  const [model, setModel] =
    React.useState("");

  const [label, setLabel] =
    React.useState("");

  const [provider, setProvider] =
    React.useState<AiProvider>("gemini");

  const [saving, setSaving] =
    React.useState(false);

  const [availableModels, setAvailableModels] =
    React.useState<AiModel[]>([]);

  const [modelLoading, setModelLoading] =
    React.useState(false);

  // -------------------------------------------------------
  // Reset / seed form
  // -------------------------------------------------------

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setApiKey("");
    setShowApiKey(false);

    setModel(
      connection?.model || ""
    );

    setLabel(
      connection?.label || ""
    );

    setProvider(
      connection?.provider || "gemini"
    );

    setAvailableModels([]);

    setSaving(false);
    setModelLoading(false);
  }, [open, connection]);

  // -------------------------------------------------------
  // Load models
  // -------------------------------------------------------

  async function handleLoadModels() {
    if (!user) {
      toast.error(
        "You are not authenticated."
      );
      return;
    }

    if (!apiKey.trim()) {
      toast.error(
        "Please enter your API key first."
      );
      return;
    }

    setModelLoading(true);
    setAvailableModels([]);
    setModel("");

    try {
      const idToken =
        await user.getIdToken();

      const models =
        await fetchAiModels(
          idToken,
          provider,
          apiKey.trim()
        );

      setAvailableModels(models);

      if (models.length === 0) {
        toast.info(
          "No models were returned by this provider."
        );
      } else {
        toast.success(
          `${models.length} models loaded.`
        );
      }
    } catch (error: any) {
      console.error(
        "Failed to load AI models",
        error
      );

      toast.error(
        error?.message ||
          "Unable to load models."
      );
    } finally {
      setModelLoading(false);
    }
  }

  // -------------------------------------------------------
  // Submit validation
  // -------------------------------------------------------

  const canSubmit =
    !!model.trim() &&
    !!label.trim() &&
    (isEdit || !!apiKey.trim());

  // -------------------------------------------------------
  // Save connection
  // -------------------------------------------------------

  async function handleSave() {
    if (!user || !canSubmit) {
      return;
    }

    setSaving(true);

    try {
      const idToken =
        await user.getIdToken();

      const saved =
        isEdit && connection
          ? await updateConnection(
              idToken,
              connection.id,
              {
                model: model.trim(),
                label: label.trim(),

                ...(apiKey.trim()
                  ? {
                      apiKey:
                        apiKey.trim(),
                    }
                  : {}),
              }
            )
          : await createConnection(
              idToken,
              {
                provider,
                apiKey: apiKey.trim(),
                model: model.trim(),
                label: label.trim(),
              }
            );

      toast.success(
        isEdit
          ? "Connection updated"
          : "Connection added"
      );

      onSaved(saved);

      onOpenChange(false);
    } catch (error: any) {
      toast.error(
        error?.message ||
          "Unable to save this connection."
      );
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------
  // Render
  // -------------------------------------------------------

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit AI Connection"
              : "Add AI Connection"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">

          {/* ------------------------------------------------
              Provider
          ------------------------------------------------ */}
          <div className="space-y-1.5">
            <Label>
              Provider
            </Label>

            <select
              value={provider}
              onChange={(e) => {
                setProvider(
                  e.target.value as AiProvider
                );

                // Clear previous models when
                // provider changes.
                setAvailableModels([]);
                setModel("");
              }}
              disabled={isEdit}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {AI_PROVIDERS.map(
                (option) => (
                  <option
                    key={option}
                    value={option}
                  >
                    {
                      PROVIDER_LABELS[
                        option
                      ]
                    }
                  </option>
                )
              )}
            </select>
          </div>

          {/* ------------------------------------------------
              Label
          ------------------------------------------------ */}
          <div className="space-y-1.5">
            <Label
              htmlFor="ai-connection-label"
            >
              Label
            </Label>

            <Input
              id="ai-connection-label"
              value={label}
              onChange={(e) =>
                setLabel(
                  e.target.value
                )
              }
              placeholder={`e.g. My ${PROVIDER_LABELS[provider]} key`}
            />
          </div>

          {/* ------------------------------------------------
              API Key
          ------------------------------------------------ */}
          <div className="space-y-1.5">
            <Label
              htmlFor="ai-connection-key"
            >
              API Key
            </Label>

            <div className="relative">
              <Input
                id="ai-connection-key"
                type={
                  showApiKey
                    ? "text"
                    : "password"
                }
                value={apiKey}
                onChange={(e) =>
                  setApiKey(
                    e.target.value
                  )
                }
                placeholder={
                  isEdit
                    ? "Leave blank to keep the current key"
                    : `Paste your ${PROVIDER_LABELS[provider]} API key`
                }
                className="pr-9"
              />

              <button
                type="button"
                onClick={() =>
                  setShowApiKey(
                    (v) => !v
                  )
                }
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={
                  showApiKey
                    ? "Hide API key"
                    : "Show API key"
                }
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              This is sent to Study Lamp&apos;s
              server once, encrypted, and stored.
              It&apos;s never sent back to any
              browser. Requests using this key are
              sent from Study Lamp&apos;s server.
            </p>
          </div>

          {/* ------------------------------------------------
              Model
          ------------------------------------------------ */}
          <div className="space-y-1.5">
            <Label
              htmlFor="ai-connection-model"
            >
              Model
            </Label>

            <div className="flex gap-2">
              <Combobox
                className="h-9 flex-1"
                options={availableModels.map(
                  (m) => ({
                    value: m.id,
                    label: m.name,
                    searchText: m.id,
                  })
                )}
                value={model}
                onChange={setModel}
                placeholder={
                  availableModels.length > 0
                    ? "Select a model"
                    : "Load models first"
                }
                searchPlaceholder="Search models..."
                emptyMessage="No model found."
                disabled={
                  modelLoading ||
                  availableModels.length === 0
                }
              />

              <Button
                type="button"
                variant="outline"
                onClick={
                  handleLoadModels
                }
                disabled={
                  modelLoading ||
                  !apiKey.trim()
                }
              >
                {modelLoading
                  ? "Loading..."
                  : "Load Models"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Select the exact{" "}
              {
                PROVIDER_LABELS[
                  provider
                ]
              }{" "}
              model to use.
            </p>
          </div>
        </div>

        {/* --------------------------------------------------
            Footer
        -------------------------------------------------- */}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
          >
            Cancel
          </Button>

          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !canSubmit
            }
          >
            {saving
              ? "Saving..."
              : isEdit
              ? "Save changes"
              : "Add connection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}