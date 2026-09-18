import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRecommendations,
  extractStepKeywords,
  resolveCurrentStep,
  selectActiveRoadmap,
} from "./recommendations";
import type { LearningRoadmap, UserInterest, VideoWithState } from "@/types";

function video(overrides: Partial<VideoWithState> & { id: string }): VideoWithState {
  return {
    playlistId: "pl1",
    title: overrides.id,
    videoUrl: "https://example.com",
    thumbnailUrl: "",
    order: 0,
    createdAt: null,
    updatedAt: null,
    categoryId: null,
    state: null,
    ...overrides,
  } as VideoWithState;
}

function roadmap(overrides: Partial<LearningRoadmap> = {}): LearningRoadmap {
  return {
    id: "r1",
    categoryId: "react",
    level: "basic",
    steps: [
      { title: "React hooks and state", description: "useState and useEffect", order: 0 },
      { title: "Routing with Next.js", description: "File-based routing", order: 1 },
    ],
    createdAt: null,
    updatedAt: null,
    adoptedFromTemplateAt: null,
    ...overrides,
  };
}

const INTERESTS: UserInterest[] = [{ categoryId: "react", level: "basic" }];

describe("extractStepKeywords", () => {
  it("drops stopwords and short words", () => {
    const keywords = extractStepKeywords({ title: "Learn the basics of React", description: "and hooks" });
    assert.ok(keywords.includes("react"));
    assert.ok(keywords.includes("hooks"));
    // "the"/"and" are stopwords; "of" is simply too short.
    assert.ok(!keywords.includes("the"));
    assert.ok(!keywords.includes("and"));
    assert.ok(!keywords.includes("of"));
    // "basics" is a real content word and is intentionally KEPT — a step
    // about the basics should still match a video about the basics.
    assert.ok(keywords.includes("basics"));
  });

  it("de-duplicates repeated words across title, description, and details", () => {
    const keywords = extractStepKeywords({ title: "React", description: "react", details: ["React state"] });
    assert.equal(keywords.filter((k) => k === "react").length, 1);
  });

  it("returns an empty list for a step with no useful text", () => {
    assert.deepEqual(extractStepKeywords({ title: "", description: "" }), []);
  });
});

describe("selectActiveRoadmap", () => {
  it("prefers the roadmap matching both the interest category and level", () => {
    const basic = roadmap({ id: "basic", level: "basic" });
    const advanced = roadmap({ id: "advanced", level: "advanced" });
    assert.equal(selectActiveRoadmap([advanced, basic], INTERESTS)?.id, "basic");
  });

  it("falls back to any roadmap for the interest category", () => {
    const advanced = roadmap({ id: "advanced", level: "advanced" });
    assert.equal(selectActiveRoadmap([advanced], INTERESTS)?.id, "advanced");
  });

  it("ignores roadmaps with no steps", () => {
    assert.equal(selectActiveRoadmap([roadmap({ steps: [] })], INTERESTS), null);
  });

  it("returns null when there are no roadmaps at all", () => {
    assert.equal(selectActiveRoadmap([], INTERESTS), null);
  });
});

describe("resolveCurrentStep", () => {
  it("moves one step per completed video in the roadmap's category", () => {
    const videos = [
      video({ id: "a", categoryId: "react", state: { status: "completed" } as any }),
      video({ id: "b", categoryId: "react", state: { status: "completed" } as any }),
      video({ id: "c", categoryId: "react", state: { status: "not_started" } as any }),
    ];
    const result = resolveCurrentStep(roadmap(), videos);
    assert.equal(result.index, 1);
    assert.equal(result.step?.title, "Routing with Next.js");
  });

  it("ignores completed videos from other categories", () => {
    const videos = [video({ id: "a", categoryId: "python", state: { status: "completed" } as any })];
    assert.equal(resolveCurrentStep(roadmap(), videos).index, 0);
  });
});

describe("buildRecommendations", () => {
  it("returns nothing when there are no videos", () => {
    assert.deepEqual(buildRecommendations({ videos: [], interests: INTERESTS, roadmaps: [roadmap()] }), []);
  });

  it("returns nothing when every video is already completed", () => {
    const videos = [video({ id: "done", categoryId: "react", state: { status: "completed" } as any })];
    assert.deepEqual(buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] }), []);
  });

  it("recommends videos matching the current roadmap step's keywords", () => {
    const videos = [
      video({ id: "match", title: "React Hooks Deep Dive", categoryId: "react" }),
      video({ id: "unrelated", title: "Intro to Rust", categoryId: "rust" }),
    ];
    const result = buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] });
    assert.equal(result[0].video.id, "match");
    assert.equal(result[0].reason, "roadmap_step");
  });

  it("falls back to interest-category matches when the step matches nothing", () => {
    const videos = [video({ id: "cat-match", title: "Something else entirely", categoryId: "react" })];
    const result = buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] });
    assert.equal(result[0].video.id, "cat-match");
    assert.equal(result[0].reason, "interest");
  });

  it("returns nothing when neither the roadmap nor interests match anything", () => {
    const videos = [video({ id: "unrelated", title: "Intro to Rust", categoryId: "rust" })];
    assert.deepEqual(buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] }), []);
  });

  it("never recommends the same video twice", () => {
    const videos = [video({ id: "both", title: "React hooks", categoryId: "react" })];
    const result = buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] });
    assert.equal(result.length, 1);
    assert.deepEqual(result.map((r) => r.video.id), ["both"]);
  });

  it("respects the limit", () => {
    const videos = Array.from({ length: 10 }, (_, i) =>
      video({ id: `v${i}`, title: `React hooks part ${i}`, categoryId: "react" })
    );
    assert.equal(buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()], limit: 3 }).length, 3);
  });

  it("puts an in-progress match ahead of an unwatched one at equal relevance", () => {
    const videos = [
      video({ id: "fresh", title: "React hooks", categoryId: "react", state: { status: "not_started" } as any }),
      video({ id: "resumable", title: "React hooks", categoryId: "react", state: { status: "in_progress" } as any }),
    ];
    const result = buildRecommendations({ videos, interests: INTERESTS, roadmaps: [roadmap()] });
    assert.equal(result[0].video.id, "resumable");
  });

  it("still recommends interest matches when the user has no roadmaps", () => {
    const videos = [video({ id: "cat-match", categoryId: "react" })];
    const result = buildRecommendations({ videos, interests: INTERESTS, roadmaps: [] });
    assert.equal(result[0].reason, "interest");
  });
});
