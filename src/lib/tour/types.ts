import type { Alignment, Side } from "driver.js";

export type TourId = "welcome" | "playlists" | "playlist-detail" | "watch" | "goals" | "roadmap";

export type TourStatus = "completed" | "skipped" | "dismissed";

/** What is persisted per tour on users/{uid}.tours.{id}. */
export interface TourRecordLike {
  v: number;
  status: TourStatus;
  step?: number;
}

export interface TourStep {
  /** `data-tour` anchor name. Omit for a centered, un-anchored popover. */
  target?: string;
  title: string;
  body: string;
  side?: Side;
  align?: Alignment;
  /**
   * The target lives in the sidebar. On phones the sidebar is a drawer that is closed by
   * default, so the tour opens it before this step (and closes it after).
   */
  needs?: "sidebar";
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}

export interface TourDef {
  id: TourId;
  /** Bump when the content changes materially: re-offers the chip (never auto-runs). */
  version: number;
  /** Shown in the tour chip / help menu. */
  label: string;
  /** Route where the tour runs. */
  route: string;
  matches: (pathname: string) => boolean;
  steps: TourStep[];
  doneLabel?: string;
}
