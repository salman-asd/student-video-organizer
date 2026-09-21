import type { TourDef, TourId } from "./types";

/**
 * Tour content. Each tour stays on ONE page: App Router navigation unmounts the DOM, so
 * cross-page tours are fragile. Targets are `data-tour="…"` anchors; a step whose target is
 * not on screen (e.g. no playlists yet → no first card) is dropped when the tour starts.
 *
 * tours.test.ts guards that every target used here exists as an anchor somewhere in src/.
 */

const isPlaylistDetail = (p: string) => /^\/playlists\/[^/]+$/.test(p) && p !== "/playlists/import";
const isWatch = (p: string) => /^\/playlists\/[^/]+\/[^/]+$/.test(p);

export const TOURS: Record<TourId, TourDef> = {
  welcome: {
    id: "welcome",
    version: 1,
    label: "Welcome tour",
    route: "/dashboard",
    matches: (p) => p === "/dashboard",
    steps: [
      {
        title: "Welcome to Study Lamp",
        body: "Study Lamp keeps score for the videos you already watch — your progress, goals and pace. This takes about a minute; skip any time.",
      },
      { target: "header-menu", mobileOnly: true, title: "Your menu", body: "Everything lives in this menu on a phone. We'll open it next.", side: "bottom", align: "start" },
      {
        target: "header-save-video",
        title: "Save any video",
        body: "Paste a YouTube or Facebook link here. We keep it in a playlist and remember exactly where you stopped.",
        side: "bottom",
        align: "center",
      },
      {
        target: "nav-playlists",
        needs: "sidebar",
        title: "Playlists = your courses",
        body: "Group videos into playlists. Progress is tracked per video and per playlist, and Continue picks up where you left off.",
        side: "right",
        align: "start",
      },
      {
        target: "nav-roadmap",
        needs: "sidebar",
        title: "Roadmap",
        body: "Pick a topic and get an ordered path of steps to follow.",
        side: "right",
        align: "start",
      },
      {
        target: "nav-goals",
        needs: "sidebar",
        title: "Goals with deadlines",
        body: "Give a step a deadline and Study Lamp tracks your pace toward it.",
        side: "right",
        align: "start",
      },
      {
        target: "dash-getstarted",
        title: "Three steps to get going",
        body: "Pick interests, generate a roadmap, then set a goal. This dashboard fills itself in as you do.",
        side: "bottom",
        align: "start",
      },
      {
        target: "dash-stats",
        title: "Your numbers",
        body: "Videos, watch time, goals and your study streak live here.",
        side: "bottom",
        align: "start",
      },
      {
        target: "header-bell",
        title: "Nudges land here",
        body: "If you fall behind a goal, you'll get a notification here — no nagging elsewhere.",
        side: "bottom",
        align: "end",
      },
      {
        target: "nav-settings",
        needs: "sidebar",
        title: "One more thing: AI and interests",
        body: "Summaries, quizzes and roadmaps use AI, and your interests shape your roadmap. Press \"Show me\" and we'll walk through AI Connections, then Interests. (✕ stops here.)",
        side: "right",
        align: "start",
      },
    ],
    doneLabel: "Show me →",
    next: "settings-ai",
  },

  playlists: {
    id: "playlists",
    version: 1,
    label: "Playlists tour",
    route: "/playlists",
    matches: (p) => p === "/playlists",
    doneLabel: "Done",
    steps: [
      { target: "pl-search", title: "Find a playlist", body: "Search by title or description.", side: "bottom", align: "start" },
      { target: "pl-filters", title: "Filters", body: "Narrow by category, visibility and tags. Active filters show as chips underneath.", side: "bottom", align: "start" },
      { target: "pl-new", title: "Create a playlist", body: "Start an empty playlist, then add videos to it.", side: "bottom", align: "end" },
      { target: "pl-import", title: "Import in bulk", body: "Bring in a whole YouTube playlist or Facebook collection at once.", side: "bottom", align: "end" },
      { target: "pl-first-card", title: "A playlist card", body: "The stack shows the cover, video count and your progress bar. Click anywhere on the card to open it; the ⋯ menu shares, edits or deletes.", side: "right", align: "start" },
      { target: "pl-continue", title: "Continue where you stopped", body: "Jumps straight to your next unwatched video.", side: "top", align: "start" },
    ],
  },

  "playlist-detail": {
    id: "playlist-detail",
    version: 1,
    label: "Playlist tour",
    route: "/playlists/[id]",
    matches: isPlaylistDetail,
    doneLabel: "Done",
    steps: [
      { target: "pd-hero", title: "Your progress at a glance", body: "Cover, counts and a progress bar for this playlist.", side: "bottom", align: "start" },
      { target: "pd-add-video", title: "Add videos", body: "Paste a link, or import a whole playlist.", side: "bottom", align: "end" },
      { target: "pd-sort", title: "Sort your way", body: "Custom drag order, newest, unwatched first, natural title order and more.", side: "bottom", align: "end" },
      { target: "pd-autoplay", title: "Autoplay", body: "When on, finishing a video starts the next one automatically.", side: "bottom", align: "end" },
      { target: "pd-first-row", title: "Each video", body: "Mark watched, favourite, set a priority or watch later. Drag to reorder when sorting is on Custom.", side: "top", align: "start" },
    ],
  },

  watch: {
    id: "watch",
    version: 1,
    label: "Video page tour",
    route: "/playlists/[id]/[video]",
    matches: isWatch,
    doneLabel: "Done",
    steps: [
      { target: "w-player", title: "Watch here", body: "Your position is saved automatically, so you can leave and resume.", side: "bottom", align: "start" },
      { target: "w-actions", title: "Quick actions", body: "Mark watched, favourite, watch later and priority.", side: "top", align: "start" },
      { target: "w-tabs", title: "Summary, notes, quiz, bookmarks", body: "Everything you learn from this video lives in these tabs.", side: "top", align: "start" },
      { target: "w-generate-summary", title: "Starter summary", body: "Generate a first-draft summary with AI, then edit it into your own words. (Needs an AI connection.)", side: "top", align: "start" },
    ],
  },

  goals: {
    id: "goals",
    version: 1,
    label: "Goals tour",
    route: "/goals",
    matches: (p) => p === "/goals",
    doneLabel: "Done",
    steps: [
      { target: "g-new", title: "Add a goal", body: "Give it a deadline and link playlists or videos — progress adds up automatically.", side: "bottom", align: "end" },
      { target: "g-stats", title: "Where you stand", body: "Totals, active, completed and overdue goals.", side: "bottom", align: "start" },
    ],
  },

  "settings-ai": {
    id: "settings-ai",
    version: 1,
    label: "AI Connections tour",
    route: "/settings/ai",
    matches: (p) => p === "/settings/ai",
    doneLabel: "Next: Interests →",
    next: "settings-interests",
    steps: [
      { target: "page-info", title: "Hover the ⓘ any time", body: "Every settings page has one: a quick summary of what the page does. Tap it on a phone.", side: "bottom", align: "start" },
      { target: "ai-guide", title: "Read this once", body: "It explains why to add a connection, how several connections work together, and what Test, Disabled, Invalid key and Cooldown mean.", side: "bottom", align: "start" },
      { target: "ai-add", title: "Add your first connection", body: "Pick a provider, paste its API key, choose a model, save. Your key is encrypted on the server and never comes back to the browser.", side: "bottom", align: "end" },
      { target: "ai-list", title: "Order = priority", body: "#1 is tried first. If it fails or hits a limit, the next one is used automatically. Drag ⋮⋮ to reorder, use the switch to disable, and Test to check a key.", side: "top", align: "start" },
      { target: "ai-system", title: "The shared fallback", body: "If none of your connections can be used, Study Lamp uses this small shared daily allowance. Your own connections never count against it.", side: "top", align: "start" },
    ],
  },

  "settings-interests": {
    id: "settings-interests",
    version: 1,
    label: "Interests tour",
    route: "/settings/interests",
    matches: (p) => p === "/settings/interests",
    doneLabel: "Finish",
    steps: [
      { target: "page-info", title: "What interests do", body: "They shape your Roadmap and the \"Recommended for you\" list on the Dashboard.", side: "bottom", align: "start" },
      { target: "int-guide", title: "How it works", body: "A short guide to topics, subtopics and what happens when you change them later.", side: "bottom", align: "start" },
      { target: "int-topics", title: "Pick your topics", body: "Click to select. These come from your Categories. One to three focused topics work best.", side: "bottom", align: "start" },
      { target: "int-subtopics", title: "Refine with subtopics", body: "Tick the subtopics you care about, or add your own under \"Other subtopic\".", side: "top", align: "start" },
      { target: "int-custom", title: "Missing a topic?", body: "Add a custom one — it's created as a new category and selected for you.", side: "top", align: "start" },
      { target: "int-save", title: "Don't forget to save", body: "Nothing is stored until you press Save interests.", side: "top", align: "start" },
    ],
  },

  roadmap: {
    id: "roadmap",
    version: 1,
    label: "Roadmap tour",
    route: "/roadmap",
    matches: (p) => p === "/roadmap",
    doneLabel: "Done",
    steps: [
      { target: "r-header", title: "Your learning path", body: "Ordered steps for each topic you picked. Update your interests in Settings and we'll offer to refresh it.", side: "bottom", align: "start" },
      { target: "r-step-goal", title: "Turn a step into a commitment", body: "Set a goal for a step and it gets a deadline and pace tracking.", side: "top", align: "start" },
    ],
  },
};

export const TOUR_LIST: TourDef[] = Object.values(TOURS);

/** The page tour (if any) for a pathname. */
export function tourForPath(pathname: string): TourDef | null {
  return TOUR_LIST.find((t) => t.matches(pathname)) ?? null;
}

/** Every anchor name any tour targets — used by the static guard test. */
export function allTourTargets(): string[] {
  return Array.from(new Set(TOUR_LIST.flatMap((t) => t.steps.map((s) => s.target).filter((x): x is string => !!x))));
}
