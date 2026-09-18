"use client";

import * as React from "react";
import { X, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOTIVATION_DISMISS_KEY,
  buildMotivationMessage,
  msUntilNextRotation,
  type MotivationInput,
} from "@/lib/motivation";

/**
 * The prominent line at the top of the Dashboard.
 *
 * Rotation is slot-based (a 6-hour bucket), not a timer that counts from when
 * the page loaded — so the message is the same one on every render inside the
 * window, and lands on the boundary at the same wall-clock moment for every
 * user. A `setTimeout` only exists to re-render when the next boundary
 * arrives while the tab is still open; it schedules itself from the bucket
 * boundary rather than a fixed duration, so it can't drift.
 *
 * Dismissal persists in localStorage: the user asked for it to be closable,
 * and having it reappear on the next navigation would make the X feel broken.
 */
export function MotivationBanner({
  input,
  className,
}: {
  input: MotivationInput;
  className?: string;
}) {
  const [dismissed, setDismissed] = React.useState(true); // assume hidden until we've read storage
  const [now, setNow] = React.useState(() => new Date());

  // Read on mount (not during render) so server and first client render agree.
  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(MOTIVATION_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // Re-render at the next rotation boundary. Keyed on `now` so each time the
  // boundary passes, we set state, which re-runs this effect and schedules the
  // following one.
  React.useEffect(() => {
    const delay = msUntilNextRotation(now);
    const timer = window.setTimeout(() => setNow(new Date()), delay);
    return () => window.clearTimeout(timer);
  }, [now]);

  const message = React.useMemo(() => buildMotivationMessage(input, now), [input, now]);

  function handleDismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(MOTIVATION_DISMISS_KEY, "1");
    } catch {
      // Non-fatal: it'll just come back next visit.
    }
  }

  if (dismissed) return null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-2xl border p-5",
        message.kind === "status"
          ? "border-accent/40 bg-gradient-to-br from-accent/12 via-card to-card"
          : "border-border bg-gradient-to-br from-card via-card to-accent/5",
        className
      )}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss this message"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <Quote className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-display text-lg font-semibold leading-snug sm:text-xl">{message.headline}</p>
          {message.detail && <p className="text-sm text-muted-foreground">{message.detail}</p>}
        </div>
      </div>
    </section>
  );
}
