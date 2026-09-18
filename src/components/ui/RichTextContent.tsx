"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { normalizeSummaryContent } from "@/lib/richText";

/**
 * Read-only renderer for rich text content (summaries today).
 *
 * Every display surface must go through this rather than setting innerHTML
 * itself, so that:
 *
 *   - the sanitizer in summaryHtml.ts is always applied (never raw stored
 *     HTML straight into the DOM), and
 *   - legacy markdown documents are converted here too, not only in the
 *     editor — otherwise an old summary renders as literal **bold** on the
 *     video page while showing correctly in the editor.
 *
 * Styling comes from the shared `.rich-text-content` class in globals.css,
 * which the editor's editable surface also uses. That shared class is the
 * reason what you see while editing matches what you see when reading.
 */
export function RichTextContent({
  value,
  className,
  emptyFallback,
}: {
  value: string;
  className?: string;
  /** Optional node shown when the content is empty. Omit to render nothing. */
  emptyFallback?: React.ReactNode;
}) {
  const html = React.useMemo(() => normalizeSummaryContent(value), [value]);

  if (!html) {
    return emptyFallback ? <>{emptyFallback}</> : null;
  }

  return (
    <div
      className={cn("rich-text-content text-sm text-foreground", className)}
      // Safe by construction: normalizeSummaryContent routes through
      // sanitizeSummaryHtml, which allowlists only structural tags (p, h1-6,
      // ul, ol, li, strong, em, blockquote, br) and strips every attribute.
      // No script/style/iframe/event handlers can survive it.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
