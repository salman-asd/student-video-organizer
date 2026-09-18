"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import {
  Bold, Italic, Strikethrough,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Minus, Code2,
  Undo2, Redo2, Eraser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeEditorOutput, normalizeSummaryContent } from "@/lib/richText";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Reusable rich-text editor.
 *
 * ─────────────────────────────
 * WHAT WAS WRONG BEFORE
 * ─────────────────────────────
 * The old component had two defects that together produced "only bold and
 * italic work":
 *
 *  1. It styled the editing surface with Tailwind's `prose prose-sm` classes.
 *     Those come from @tailwindcss/typography, which is NOT a dependency of
 *     this project — so every one of them compiled to nothing. The toolbar
 *     commands were all working fine (Tiptap was faithfully creating `<h2>`,
 *     `<ul>`, `<blockquote>`), but with no CSS for those tags a heading, a
 *     paragraph and a list item all rendered as identical unstyled text. Bold
 *     and italic appeared to work only because `<strong>`/`<em>` carry
 *     browser-default styling.
 *
 *  2. It passed `placeholder` as an editor *attribute* — a literal
 *     placeholder="..." DOM attribute on a contenteditable element. Nothing
 *     renders that; contenteditable has no placeholder concept.
 *
 * Both are fixed: all styling now comes from one shared `.rich-text-content`
 * stylesheet that the read-only renderer uses too, and the real Tiptap
 * `Placeholder` extension supplies the empty-state hint.
 *
 * ─────────────────────────────
 * WHY TIPTAP IS KEPT
 * ─────────────────────────────
 * The alternative considered was a markdown editor (react-markdown over a
 * textarea, or a CodeMirror-based one). Tiptap stays, because the root cause
 * was never Tiptap:
 *
 *   - Storage is HTML. A markdown editor needs a bidirectional HTML<->markdown
 *     converter, and every round-trip loses structure (nested lists, quotes
 *     containing lists) unless that converter is written very carefully.
 *     Tiptap round-trips its own HTML losslessly.
 *   - The product is a WYSIWYG one: a learner highlights and bolds things while
 *     watching a video. They never want to see or type syntax.
 *   - Tiptap and its extensions are already installed and tree-shaken.
 *
 * ─────────────────────────────
 * CONTRACT
 * ─────────────────────────────
 * `value` may be HTML, legacy markdown, or plain text — all three are accepted
 * and normalized on load, so legacy summaries open correctly. `onChange` always
 * emits canonical HTML. See src/lib/richText.ts for the storage-format
 * reasoning and the migration path.
 */

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Which toolbar controls to show. Defaults to the full summary set. */
  features?: RichTextFeature[];
  /** Rendered under the editing surface; useful for hints or counters. */
  footer?: React.ReactNode;
  minHeight?: string;
}

export type RichTextFeature =
  | "bold" | "italic" | "strike"
  | "h1" | "h2" | "h3" | "bulletList" | "orderedList"
  | "blockquote" | "code" | "horizontalRule"
  | "undo" | "redo" | "clearFormatting";

const DEFAULT_FEATURES: RichTextFeature[] = [
  "bold", "italic", "strike",
  "h1", "h2", "h3",
  "bulletList", "orderedList", "blockquote",
  "undo", "redo", "clearFormatting",
];

export function RichTextEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  disabled = false,
  features = DEFAULT_FEATURES,
  footer,
  minHeight = "160px",
}: RichTextEditorProps) {
  // `immediatelyRender: false` is required under the Next.js App Router: it
  // makes the editor initialize on the client only, so SSR and the first
  // client render agree and Tiptap does not report a hydration mismatch.
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // The enabled vocabulary deliberately matches what summaryHtml.ts's
      // sanitizer allows through (p, h1-6, ul, ol, li, strong, em, blockquote,
      // br). Enabling more would let a user build markup that gets silently
      // stripped on the next read, which reads as data loss.
      //
      // StarterKit v3 does not include Link, so there is nothing to disable
      // for it; headings are capped at the three levels the toolbar offers.
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({
        placeholder: placeholder || "Write something…",
        // Must match the class the CSS in globals.css paints.
        emptyEditorClass: "is-editor-empty",
      }),
    ],
    content: normalizeSummaryContent(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "rich-text-content focus:outline-none",
        style: `min-height: ${minHeight}`,
        "aria-label": placeholder || "Rich text editor",
        "data-testid": "rich-text-surface",
      },
    },
    onUpdate: ({ editor: instance }) => {
      // An "empty" Tiptap document serializes to "<p></p>", which is not
      // falsy. Storing that would make the next read see non-empty content and
      // render a blank paragraph where the placeholder belongs, so collapse it
      // to the empty string.
      const html = normalizeEditorOutput(instance.getHTML());
      lastEmitted.current = html;
      onChange(html);
    },
  });

  // Tracks the last value this component emitted, so the sync effect below can
  // tell "the parent echoed my own change back" apart from "the parent loaded
  // something new". Without it, normalizing the emitted HTML would not always
  // compare equal to what we sent, and the effect would re-set the content on
  // every keystroke — resetting the cursor to the start of the document.
  const lastEmitted = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!editor) return;
    const normalized = normalizeSummaryContent(value);
    if (lastEmitted.current !== null && normalized === lastEmitted.current) return;

    const current = normalizeEditorOutput(editor.getHTML());
    if (current === normalized) return;

    lastEmitted.current = normalized;
    editor.commands.setContent(normalized || "", { emitUpdate: false });
  }, [editor, value]);

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Re-render the toolbar when formatting/selection changes. Tiptap's editor is
  // mutable and does not notify React on its own, so without a subscription the
  // active state of every button is frozen at first paint.
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (!editor) return () => { };
      editor.on("transaction", onStoreChange);
      return () => {
        editor.off("transaction", onStoreChange);
      };
    },
    [editor]
  );
  React.useSyncExternalStore(
    subscribe,
    () => editor?.state.doc.nodeSize ?? 0,
    () => 0
  );

  if (!editor) {
    // Reserve the space so the surrounding layout does not jump on mount.
    return (
      <div className={cn("overflow-hidden rounded-md border-input bg-background", className)}>
        <div className="border-b border-input bg-muted/30 p-1.5" style={{ height: 41 }} />
        <div className="animate-pulse bg-muted/20" style={{ height: minHeight }} />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          "rich-text-editor overflow-hidden rounded-md border-input bg-background",
          disabled && "opacity-60",
          className
        )}
      >
        <Toolbar editor={editor} features={features} disabled={disabled} />
        <div className="px-3 py-2" onBlur={onBlur}>
          <EditorContent editor={editor} />
        </div>
        {footer}
      </div>
    </TooltipProvider>
  );
}

// ── Toolbar ─────────────────

interface ToolbarAction {
  feature: RichTextFeature;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: (editor: Editor) => boolean;
  isDisabled?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const ACTIONS: ToolbarAction[] = [
  { feature: "bold", label: "Bold", icon: Bold, isActive: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
  { feature: "italic", label: "Italic", icon: Italic, isActive: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
  { feature: "strike", label: "Strikethrough", icon: Strikethrough, isActive: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
  { feature: "h1", label: "Heading 1", icon: Heading1, isActive: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { feature: "h2", label: "Heading 2", icon: Heading2, isActive: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { feature: "h3", label: "Heading 3", icon: Heading3, isActive: (e) => e.isActive("heading", { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { feature: "bulletList", label: "Bullet list", icon: List, isActive: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  { feature: "orderedList", label: "Numbered list", icon: ListOrdered, isActive: (e) => e.isActive("orderedList"), run: (e) => e.chain().focus().toggleOrderedList().run() },
  { feature: "blockquote", label: "Quote", icon: Quote, isActive: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
  { feature: "code", label: "Inline code", icon: Code2, isActive: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
  { feature: "horizontalRule", label: "Divider", icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { feature: "undo", label: "Undo", icon: Undo2, isDisabled: (e) => !e.can().undo(), run: (e) => e.chain().focus().undo().run() },
  { feature: "redo", label: "Redo", icon: Redo2, isDisabled: (e) => !e.can().redo(), run: (e) => e.chain().focus().redo().run() },
  { feature: "clearFormatting", label: "Clear formatting", icon: Eraser, run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run() },
];

const SEPARATOR_AFTER = new Set<RichTextFeature>(["strike", "h3", "blockquote"]);

function Toolbar({
  editor,
  features,
  disabled,
}: {
  editor: Editor;
  features: RichTextFeature[];
  disabled: boolean;
}) {
  const visible = ACTIONS.filter((action) => features.includes(action.feature));

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 border-b border-input bg-muted/30 p-1.5"
      role="toolbar"
      aria-label="Formatting"
    >
      {visible.map((action, index) => {
        const Icon = action.icon;
        const active = action.isActive?.(editor) ?? false;
        const unavailable = disabled || (action.isDisabled?.(editor) ?? false);

        return (
          <React.Fragment key={action.feature}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  // Keeps focus (and therefore the text selection the command
                  // acts on) in the editor. Without this, clicking a toolbar
                  // button blurs the editor and the selection collapses, so
                  // "bold" would apply to nothing.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => action.run(editor)}
                  disabled={unavailable}
                  aria-label={action.label}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{action.label}</TooltipContent>
            </Tooltip>
            {SEPARATOR_AFTER.has(action.feature) && index < visible.length - 1 && (
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
