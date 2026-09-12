import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

import { searchYouTubePlaylists } from "./youtubeSearch";

type FetchArgs = Parameters<typeof fetch>;

describe("searchYouTubePlaylists", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.YOUTUBE_API_KEY;
  let mockImpl: (url: string) => Promise<Response>;

  before(() => {
    globalThis.fetch = ((...args: FetchArgs) => mockImpl(String(args[0]))) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    process.env.YOUTUBE_API_KEY = originalKey;
  });

  beforeEach(() => {
    process.env.YOUTUBE_API_KEY = "test-key";
  });

  function jsonResponse(body: unknown, ok = true) {
    return new Response(JSON.stringify(body), { status: ok ? 200 : 500 });
  }

  it("maps search.list playlist items into a flat, UI-ready shape", async () => {
    mockImpl = async () =>
      jsonResponse({
        items: [
          {
            id: { playlistId: "PL123" },
            snippet: {
              title: "React Hooks Crash Course",
              channelTitle: "Frontend Masters",
              thumbnails: { medium: { url: "https://img.example/1.jpg" } },
            },
          },
        ],
      });

    const result = await searchYouTubePlaylists("react hooks", 5);
    assert.equal(result.error, null);
    assert.deepEqual(result.playlists, [
      {
        playlistId: "PL123",
        title: "React Hooks Crash Course",
        channelTitle: "Frontend Masters",
        thumbnailUrl: "https://img.example/1.jpg",
        playlistUrl: "https://www.youtube.com/playlist?list=PL123",
      },
    ]);
  });

  it("skips items with no playlistId instead of throwing", async () => {
    mockImpl = async () =>
      jsonResponse({ items: [{ id: {}, snippet: { title: "No id" } }] });

    const result = await searchYouTubePlaylists("react hooks", 5);
    assert.equal(result.error, null);
    assert.deepEqual(result.playlists, []);
  });

  it("returns a friendly error instead of throwing on a non-OK response", async () => {
    mockImpl = async () => jsonResponse({ error: { message: "quota exceeded" } }, false);

    const result = await searchYouTubePlaylists("react hooks", 5);
    assert.deepEqual(result.playlists, []);
    assert.equal(result.error, "quota exceeded");
  });

  it("returns an empty result without calling fetch when the query is blank", async () => {
    let called = false;
    mockImpl = async () => {
      called = true;
      return jsonResponse({ items: [] });
    };

    const result = await searchYouTubePlaylists("   ", 5);
    assert.deepEqual(result, { playlists: [], error: null });
    assert.equal(called, false);
  });

  it("reports a clear error when YOUTUBE_API_KEY is missing", async () => {
    delete process.env.YOUTUBE_API_KEY;
    const result = await searchYouTubePlaylists("react hooks", 5);
    assert.deepEqual(result.playlists, []);
    assert.match(result.error || "", /YOUTUBE_API_KEY/);
  });
});
