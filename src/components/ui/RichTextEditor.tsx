"use client";

import * as React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";
import { toSummaryHtml } from "@/lib/summaryHtml";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: toSummaryHtml(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none",
          className,
        ),
        placeholder: placeholder || "",
        "aria-label": placeholder || "Rich text editor",
      },
    },
    onUpdate: ({ editor }) => {
      const nextHtml = editor.isEmpty ? "" : editor.getHTML();
      onChange(nextHtml);
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const nextHtml = toSummaryHtml(value);
    if (editor.getHTML() !== nextHtml) {
      editor.commands.setContent(nextHtml || "", { emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background">
      <div className="flex flex-wrap gap-1 border-b border-input bg-muted/30 p-2">
        <ToolbarButton
          label="H2"
          active={editor?.isActive("heading", { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="Bold"
          active={editor?.isActive("bold")}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          active={editor?.isActive("italic")}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Bullet list"
          active={editor?.isActive("bulletList")}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          active={editor?.isActive("orderedList")}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          active={editor?.isActive("blockquote")}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
      </div>
      <EditorContent editor={editor} />
      {placeholder && !value && editor?.isEmpty && (
        <div className="sr-only">{placeholder}</div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded border px-2 py-1 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}
