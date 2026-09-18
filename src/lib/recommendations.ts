import { currentRoadmapStepIndex } from "@/lib/roadmapGoalUtils";
import type { LearningRoadmap, RoadmapStep, UserInterest, VideoWithState } from "@/types";

/**
 * "Recommended for you" (Phase C3).
 *
 * This is deliberately NOT a content-discovery system. It's a smarter filter
 * over what's already in the user's library (shared + personal, i.e. whatever
 * useAllVideos returned) — the roadmap's current step and the user's interest
 * categories are the two signals, in that order of priority, because a
 * roadmap step is a concrete commitment while an interest is only a topic.
 *
 * Kept pure and separate from the Dashboard component so the ranking is
 * unit-testable without a Firestore or React in the picture.
 */

export type RecommendationReason = "roadmap_step" | "interest";

export interface Recommendation {
  video: VideoWithState;
  reason: RecommendationReason;
  /** Short, human-readable explanation shown on the card. */
  reasonLabel: string;
}

export interface RecommendationInput {
  videos: VideoWithState[];
  interests: UserInterest[];
  roadmaps: LearningRoadmap[];
  /** Used for tie-breaking so the section is stable across renders. */
  limit?: number;
}

/** Words shorter than this are dropped from a step title before matching —
 *  "and", "the", "to" match everything and would make the score meaningless. */
const MIN_KEYWORD_LENGTH = 4;

const STOPWORDS = new Set([
  "and", "the", "with", "your", "you", "for", "from", "that", "this", "into",
  "learn", "learning", "step", "week", "basic", "intermediate", "advanced",
  "practice", "study", "using", "build", "create", "understand",
]);

/** Splits a roadmap step into comparable keywords. */
export function extractStepKeywords(step: Pick<RoadmapStep, "title" | "description" | "details">): string[] {
  const text = [step.title, step.description, ...(step.details ?? [])].filter(Boolean).join(" ");
  // Strip anything that isn't a letter/digit/space, then split. Hyphens are
  // removed rather than kept as word characters so "file-based" and "file
  // based" reduce to the same token.
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(word));
  return Array.from(new Set(words));
}

function matchesKeyword(haystack: string, keyword: string): boolean {
  // Substring rather than word-boundary matching on purpose: a step saying
  // "React" should match a video titled "ReactJS Crash Course", and "hooks"
  // should match "React Hooks Explained".
  return haystack.includes(keyword);
}

/**
 * Picks the roadmap that best represents what the user is working on right
 * now. Preference order: a roadmap for a category the user explicitly lists
 * as an interest, at the level they chose; then any roadmap that actually has
 * steps (an empty roadmap has nothing to recommend against).
 */
export function selectActiveRoadmap(
  roadmaps: LearningRoadmap[],
  interests: UserInterest[]
): LearningRoadmap | null {
  const withSteps = (roadmaps ?? []).filter((roadmap) => (roadmap.steps?.length ?? 0) > 0);
  if (withSteps.length === 0) return null;

  for (const interest of interests ?? []) {
    const exact = withSteps.find(
      (roadmap) => roadmap.categoryId === interest.categoryId && roadmap.level === interest.level
    );
    if (exact) return exact;
  }

  for (const interest of interests ?? []) {
    const byCategory = withSteps.find((roadmap) => roadmap.categoryId === interest.categoryId);
    if (byCategory) return byCategory;
  }

  return withSteps[0];
}

/**
 * How far into a roadmap the user is, measured in completed videos whose
 * category matches the roadmap. Reuses currentRoadmapStepIndex so the
 * Dashboard, the roadmap page, and any future surface agree on "current step".
 */
export function resolveCurrentStep(
  roadmap: LearningRoadmap,
  videos: VideoWithState[]
): { step: RoadmapStep | null; index: number; completedVideos: number } {
  const steps = roadmap.steps ?? [];
  if (steps.length === 0) return { step: null, index: 0, completedVideos: 0 };

  const completedVideos = videos.filter(
    (video) => video.categoryId === roadmap.categoryId && video.state?.status === "completed"
  ).length;

  const index = currentRoadmapStepIndex(steps, completedVideos);
  return { step: steps[index] ?? null, index, completedVideos };
}

/**
 * Ranks the user's own library against the current roadmap step, then against
 * their interest categories. Watched videos are excluded — a recommendation
 * you've already finished isn't a recommendation — and anything already in
 * progress is ranked first within its tier, since resuming is the cheapest
 * way to make progress.
 *
 * Returns [] when nothing matches. The Dashboard relies on that: the spec is
 * explicit that an empty result should render nothing rather than an awkward
 * "no recommendations" card.
 */
export function buildRecommendations({
  videos,
  interests,
  roadmaps,
  limit = 4,
}: RecommendationInput): Recommendation[] {
  if (!videos || videos.length === 0) return [];

  const unwatched = videos.filter((video) => (video.state?.status ?? "not_started") !== "completed");
  if (unwatched.length === 0) return [];

  const roadmap = selectActiveRoadmap(roadmaps, interests);
  const results: Recommendation[] = [];
  const claimed = new Set<string>();

  if (roadmap) {
    const { step, index } = resolveCurrentStep(roadmap, videos);
    if (step) {
      const keywords = extractStepKeywords(step);
      const matched = rankedMatches(unwatched, keywords);
      for (const video of matched) {
        if (claimed.has(video.id)) continue;
        claimed.add(video.id);
        results.push({
          video,
          reason: "roadmap_step",
          reasonLabel: `Matches your roadmap: step ${index + 1} — ${step.title}`,
        });
        if (results.length >= limit) return results;
      }
    }
  }

  const interestIds = new Set((interests ?? []).map((interest) => interest.categoryId));
  if (interestIds.size > 0) {
    const interestVideos = unwatched.filter(
      (video) => !!video.categoryId && interestIds.has(video.categoryId) && !claimed.has(video.id)
    );
    for (const video of sortByResumability(interestVideos)) {
      if (claimed.has(video.id)) continue;
      claimed.add(video.id);
      results.push({ video, reason: "interest", reasonLabel: "Matches one of your interests" });
      if (results.length >= limit) return results;
    }
  }

  return results;
}

function rankedMatches(videos: VideoWithState[], keywords: string[]): VideoWithState[] {
  if (keywords.length === 0) return [];

  const scored = videos
    .map((video) => {
      const haystack = `${video.title} ${video.description ?? ""} ${video.playlistTitle ?? ""}`.toLowerCase();
      const score = keywords.reduce((total, keyword) => (matchesKeyword(haystack, keyword) ? total + 1 : total), 0);
      return { video, score };
    })
    .filter((entry) => entry.score > 0);

  // More keyword hits first, then resumable (in-progress) videos, then the
  // original library order so results don't reshuffle between renders.
  return scored
    .sort((a, b) => b.score - a.score || resumabilityRank(b.video) - resumabilityRank(a.video))
    .map((entry) => entry.video);
}

function sortByResumability(videos: VideoWithState[]): VideoWithState[] {
  return [...videos].sort((a, b) => resumabilityRank(b) - resumabilityRank(a));
}

function resumabilityRank(video: VideoWithState): number {
  return video.state?.status === "in_progress" ? 1 : 0;
}
