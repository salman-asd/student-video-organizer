"use client";

import * as React from "react";
import { Compass, X } from "lucide-react";
import { useTour } from "@/components/tour/TourProvider";
import { TOURS } from "@/lib/tour/tours";
import type { TourId } from "@/lib/tour/types";
import { cn } from "@/lib/utils";

/**
 * Small, dismissible "Take a quick tour" prompt. Only shows when the page has at least two
 * anchored steps on screen and the user hasn't finished/skipped/dismissed this tour version.
 * Tours never auto-run except the welcome tour for brand-new accounts — this is the opt-in path.
 */
export function TourChip({ tourId, className }: { tourId: TourId; className?: string }) {
  const { isOffered, startTour, dismiss } = useTour();
  if (!isOffered(tourId)) return null;

  return (
    <span className={cn("inline-flex items-center overflow-hidden rounded-full border border-border bg-card text-xs shadow-sm", className)}>
      <button
        type="button"
        onClick={() => startTour(tourId, { force: true })}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Compass className="h-3.5 w-3.5 text-accent" aria-hidden />
        {TOURS[tourId].label === "Welcome tour" ? "Take the 1-minute tour" : "Take a quick tour"}
      </button>
      <button
        type="button"
        onClick={() => dismiss(tourId)}
        aria-label="Dismiss tour suggestion"
        className="border-l border-border px-2 py-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
