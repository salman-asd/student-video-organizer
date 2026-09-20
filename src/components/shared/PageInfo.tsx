"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The "ⓘ" beside a page title.
 *
 * - Desktop: opens on hover (and stays while the pointer is over the icon or the card).
 * - Touch / keyboard: opens on tap, Enter or Space; Esc or an outside click closes it.
 *   (A plain tooltip can't do this — it has no tap behaviour on phones.)
 * - `guideId` (optional) adds a "Read the full guide" link that scrolls to and opens the
 *   matching <GuideCard id="…"/> on the same page.
 */
export function PageInfo({
  title,
  children,
  guideId,
  label = "About this page",
}: {
  title: string;
  children: React.ReactNode;
  guideId?: string;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pinned = React.useRef(false);
  const lastPointer = React.useRef<string>("mouse");
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return; // touch is handled by the tap/click below
    cancelClose();
    setOpen(true);
  };
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse" || pinned.current) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 150); // grace period to move onto the card
  };
  React.useEffect(() => cancelClose, []);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) pinned.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          onPointerDown={(event) => { lastPointer.current = event.pointerType; }}
          onClick={(event) => {
            // With a real mouse, a click while the hover card is already open "pins" it instead of
            // closing it. Touch and keyboard (event.detail === 0) keep normal toggle behaviour.
            if (open && !pinned.current && lastPointer.current === "mouse" && event.detail > 0) {
              event.preventDefault();
              pinned.current = true;
            }
          }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[22rem] max-w-[calc(100vw-2rem)] space-y-2 text-sm"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={hoverOpen}
        onPointerLeave={hoverClose}
      >
        <p className="font-display text-sm font-semibold">{title}</p>
        <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
        {guideId && (
          <button
            type="button"
            className="text-xs font-medium text-accent hover:underline"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new CustomEvent("sl:guide-open", { detail: guideId }));
            }}
          >
            Read the full guide ↓
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
