"use client";

import * as React from "react";
import { Eye, PencilLine } from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { RichTextContent } from "@/components/ui/RichTextContent";
import { cn } from "@/lib/utils";

/**
 * The summary surface used by every video page.
 *
 * ─────────────────────────────
 * WHY A PREVIEW TOGGLE
 * ─────────────────────────────
 * The editor alone answers "can I write formatted text?", but not "does this
 * look right when it's displayed?" — and those are different code paths. A
 * preview mode that renders through the SAME <RichTextContent> the read-only
 * surfaces use makes any divergence visible immediately instead of being
 * discovered later on a share page.
 *
 * It also removes any reason for another "read-only summary" view to hand-roll
 * its own rendering, which is how the original bug spread in the first place.
 */
export function SummaryPane({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  emptyHint = "No summary yet. Write one above, or generate a starter draft.",
}: {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  emptyHint?: string;
}) {
  const [mode, setMode] = React.useState<"write" | "preview">("write");

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {mode === "write" ? "Editing summary" : "Preview — how this looks when read"}
        </p>
        <div className="flex gap-1" role="tablist" aria-label="Summary mode">
          <ModeButton
            active={mode === "write"}
            onClick={() => setMode("write")}
            icon={PencilLine}
            label="Write"
          />
          <ModeButton
            active={mode === "preview"}
            onClick={() => setMode("preview")}
            icon={Eye}
            label="Preview"
          />
        </div>
      </div>

      {mode === "write" ? (
        <RichTextEditor
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      ) : (
        <div className="min-h-[160px] rounded-md border-input bg-background px-3 py-2">
          <RichTextContent
            value={value}
            emptyFallback={<p className="text-sm text-muted-foreground">{emptyHint}</p>}
          />
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
