"use client";

import * as React from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KEY = (id: string) => `sl:guide:${id}`;

/**
 * A collapsible "How this works" panel.
 *
 * Open the first time (so a new user actually sees it), then remembers the user's choice per
 * guide in localStorage (read after mount, so returning users who collapsed it may see it open for
 * a split second). `PageInfo`'s "Read the full guide" link opens and scrolls to it via the
 * `sl:guide-open` event.
 */
export function GuideCard({
  id,
  title,
  defaultOpen = true,
  forceOpen = false,
  tourAnchor,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  /** Keep it open regardless of the saved choice (e.g. brand-new user with nothing set up). */
  forceOpen?: boolean;
  /** `data-tour` anchor name for the guided tour. */
  tourAnchor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(KEY(id));
      if (saved === "open") setOpen(true);
      else if (saved === "closed") setOpen(false);
    } catch { /* private mode — keep the default */ }
  }, [id]);

  React.useEffect(() => {
    const onOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) return;
      setOpen(true);
      requestAnimationFrame(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("sl:guide-open", onOpen);
    return () => window.removeEventListener("sl:guide-open", onOpen);
  }, [id]);

  const isOpen = open || forceOpen;
  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    try { window.localStorage.setItem(KEY(id), next ? "open" : "closed"); } catch { /* ignore */ }
  };

  return (
    <Card ref={rootRef} id={`guide-${id}`} data-tour={tourAnchor} className="scroll-mt-20 border-accent/30 bg-accent/5">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={`guide-${id}-body`}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-2 font-display text-base font-semibold">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden /> {title}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {isOpen ? "Hide" : "Show"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
          </span>
        </button>
        {isOpen && (
          <div id={`guide-${id}-body`} className="space-y-4 border-t border-accent/20 px-4 pb-4 pt-3 text-sm">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Small consistent building blocks for guide content. */
export function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="space-y-1.5 text-muted-foreground">{children}</div>
    </section>
  );
}

export function GuideList({ items, ordered = false }: { items: React.ReactNode[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={cn("space-y-1 pl-5", ordered ? "list-decimal" : "list-disc")}>
      {items.map((item, index) => <li key={index}>{item}</li>)}
    </Tag>
  );
}
