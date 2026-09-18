/**
 * Layout model for the Continue Watching page's playlist groups.
 *
 * Lives here rather than in the page file because the App Router only permits a
 * `default` export from `page.tsx` (any other export fails the build), and
 * because this is worth testing without rendering the page.
 *
 * ─────────────────────────────
 * THE THREE STATES
 * ─────────────────────────────
 * A playlist group is always in exactly one of these:
 *
 *   "packed"  The default for any playlist with 2+ videos. Renders as a single
 *             compact card showing the FIRST video's thumbnail with a
 *             "N videos" badge and a stacked-cards shadow behind it — it reads
 *             as a deck of videos rather than a lone tile.
 *
 *   "row"     Every video in one horizontally-scrolling row. Good for scanning
 *             a long playlist without the page growing tall.
 *
 *   "wrap"    Every video in a grid that wraps across as many rows as needed.
 *             Good when you actually want to see everything at once.
 *
 * State is per-group and deliberately in-memory: it's a transient "let me look
 * at this playlist" action, and persisting it would mean arriving at an
 * unpredictably long page.
 */

export type GroupLayout = "packed" | "row" | "wrap";

/** Packed is the default so a long resume queue stays scannable. */
export const DEFAULT_GROUP_LAYOUT: GroupLayout = "packed";

export function isGroupLayout(value: unknown): value is GroupLayout {
  return value === "packed" || value === "row" || value === "wrap";
}

/** How many cards a packed group renders. */
export const PACKED_VIDEO_COUNT = 1;

/**
 * Outer container for a group's cards.
 *
 * Only "packed" sizes itself to a small fixed width, because that card is a
 * single thumbnail acting as a playlist entry point. "row" must not constrain
 * width (it scrolls), and "wrap" fills the space.
 */
export function gridClassFor(layout: GroupLayout): string {
  switch (layout) {
    case "packed":
      // Narrow enough that the play-stack card reads as a "folder" rather than
      // a video you're expected to resume right now.
      return "flex";
    case "row":
      return "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2";
    case "wrap":
      return "flex flex-wrap gap-3";
  }
}

/** Per-card wrapper classes for the given layout. */
export function cardClassFor(layout: GroupLayout): string {
  switch (layout) {
    case "packed":
      return "w-[190px] shrink-0";
    case "row":
      // Fixed width, otherwise flex shrinks every card to fit and defeats the
      // horizontal scrolling the layout exists for.
      return "w-[210px] shrink-0 snap-start";
    case "wrap":
      return "w-[210px] shrink-0";
  }
}

/** The videos a group should render for the given layout. */
export function visibleVideosFor<T>(videos: T[], layout: GroupLayout): T[] {
  return layout === "packed" ? videos.slice(0, PACKED_VIDEO_COUNT) : videos;
}

/** How many videos a packed group is representing. */
export function hiddenCountFor(total: number, layout: GroupLayout): number {
  return layout === "packed" ? Math.max(0, total - PACKED_VIDEO_COUNT) : 0;
}
