import type { TourDef, TourStep } from "./types";

/**
 * First anchor with this name that is actually on screen.
 *
 * Not `document.querySelector`: the Sidebar is rendered twice (desktop <aside> and the mobile
 * drawer), and on a phone the hidden desktop copy is still in the DOM. querySelector would
 * return that invisible element and the popover would point at the top-left corner.
 * `getClientRects()` is empty for `display:none` subtrees, which is exactly the filter we need.
 */
export function visibleTourEl(name: string, root: ParentNode = document): HTMLElement | null {
  const nodes = root.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const node of Array.from(nodes)) {
    if (node.getClientRects().length > 0) return node;
  }
  return null;
}

/** Steps that apply to this viewport and whose target can be shown. */
export function availableSteps(def: TourDef, isMobile: boolean, find: (name: string) => unknown = visibleTourEl): TourStep[] {
  return def.steps.filter((step) => {
    if (step.mobileOnly && !isMobile) return false;
    if (step.desktopOnly && isMobile) return false;
    if (!step.target) return true;
    // On a phone the drawer is closed until the tour opens it, so we can't see these yet.
    if (step.needs === "sidebar" && isMobile) return true;
    return !!find(step.target);
  });
}

/** A tour is worth offering only if at least two anchored steps remain. */
export function isTourOfferable(def: TourDef, isMobile: boolean, find?: (name: string) => unknown): boolean {
  return availableSteps(def, isMobile, find).filter((s) => !!s.target).length >= 2;
}

export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function isDialogOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector('[role="dialog"]');
}
