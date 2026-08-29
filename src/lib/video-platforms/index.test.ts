import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectVideoPlatform,
  extractExternalVideoId,
  generateCanonicalUrl,
  generateEmbedUrl,
  generateOriginalWatchUrl,
  getExternalWatchAction,
  normalizeVideoUrl,
  validateVideoUrl,
} from "./index";

describe("video platform detection and URL normalization", () => {
  it("detects youtube watch URLs", () => {
    assert.equal(detectVideoPlatform("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "youtube");
    assert.equal(extractExternalVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  });

  it("returns a platform-specific external watch action", () => {
    assert.deepEqual(getExternalWatchAction("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
      href: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      label: "Watch on YouTube",
    });
    assert.deepEqual(getExternalWatchAction("https://www.facebook.com/watch/?v=1234567890"), {
      href: "https://www.facebook.com/watch/?v=1234567890",
      label: "Watch on Facebook",
    });
    assert.deepEqual(getExternalWatchAction("https://example.com/video/abc"), {
      href: "https://example.com/video/abc",
      label: "Watch Original Video",
    });
  });

  it("supports YouTube Shorts and shortened URLs", () => {
    assert.equal(detectVideoPlatform("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "youtube-shorts");
    assert.equal(detectVideoPlatform("https://youtu.be/dQw4w9WgXcQ"), "youtube");

    const metadata = normalizeVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=25");
    assert.ok(metadata);
    assert.equal(metadata?.canonicalUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(metadata?.originalWatchUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(metadata?.embedUrl, "https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("normalizes duplicate youtube URLs to the same canonical result", () => {
    const canonicalFirst = generateCanonicalUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share");
    const canonicalSecond = generateCanonicalUrl("https://youtu.be/dQw4w9WgXcQ?si=abc123");
    assert.equal(canonicalFirst, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(canonicalSecond, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(canonicalFirst, canonicalSecond);
  });

  it("detects facebook video URLs", () => {
    const result = normalizeVideoUrl("https://www.facebook.com/watch/?v=1234567890");
    assert.ok(result);
    assert.equal(result?.platform, "facebook");
    assert.equal(result?.canonicalUrl, "https://www.facebook.com/watch/?v=1234567890");
    assert.equal(result?.externalVideoId, "1234567890");
    assert.match(result?.embedUrl ?? "", /facebook\.com\/plugins\/video\.php/i);
  });

  it("detects vimeo video URLs", () => {
    const result = normalizeVideoUrl("https://vimeo.com/123456789");
    assert.ok(result);
    assert.equal(result?.platform, "vimeo");
    assert.equal(result?.canonicalUrl, "https://vimeo.com/123456789");
    assert.equal(result?.embedUrl, "https://player.vimeo.com/video/123456789");
  });

  it("handles generic URLs without a known provider", () => {
    assert.equal(detectVideoPlatform("https://example.com/video/abc"), "generic");
    assert.equal(validateVideoUrl("https://example.com/video/abc"), true);
    assert.equal(generateOriginalWatchUrl("https://example.com/video/abc"), "https://example.com/video/abc");
    assert.equal(generateEmbedUrl("https://example.com/video/abc"), null);
  });

  it("rejects invalid URLs and malformed values", () => {
    assert.equal(validateVideoUrl(""), false);
    assert.equal(validateVideoUrl("not-a-url"), false);
    assert.equal(validateVideoUrl("https://www.youtube.com/watch"), false);
    assert.equal(validateVideoUrl("https://www.facebook.com/watch"), false);
    assert.equal(extractExternalVideoId("https://www.youtube.com/watch"), null);
  });
});
