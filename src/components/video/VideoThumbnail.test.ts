import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * The thumbnail component is client-only (next/image, React state), so these
 * exercise the pure decision logic extracted from it. Testing the *rules*
 * matters more than the markup here: the whole point of this component is that
 * "when is progress shown" and "when is the fallback shown" are answered once
 * for every surface, instead of being re-decided per page.
 */

/** Mirrors VideoThumbnail's rendering decision. */
function shouldShowFallback(src: string | null | undefined, failed: boolean): boolean {
  const hasSrc = typeof src === "string" && src.trim().length > 0;
  return !hasSrc || failed;
}

/** Mirrors VideoThumbnail's clampPercent. */
function clampPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Mirrors VideoThumbnail's showProgress. */
function shouldShowProgress(completed: boolean, progressPercent: number | null | undefined): boolean {
  return completed || clampPercent(progressPercent) > 0;
}

describe("thumbnail fallback decision", () => {
  it("falls back when the URL is missing entirely", () => {
    assert.equal(shouldShowFallback(null, false), true);
    assert.equal(shouldShowFallback(undefined, false), true);
    assert.equal(shouldShowFallback("", false), true);
    assert.equal(shouldShowFallback("   ", false), true);
  });

  it("falls back after the image reports an error", () => {
    // The reported gap: a dead YouTube URL or deleted upload used to leave the
    // browser's broken-image glyph instead of anything intentional.
    assert.equal(shouldShowFallback("https://example.com/x.jpg", true), true);
  });

  it("renders the real image when the URL is present and healthy", () => {
    assert.equal(shouldShowFallback("https://example.com/x.jpg", false), false);
  });
});

describe("thumbnail progress decision", () => {
  it("shows no bar for a video that was never started", () => {
    assert.equal(shouldShowProgress(false, 0), false);
    assert.equal(shouldShowProgress(false, null), false);
    assert.equal(shouldShowProgress(false, undefined), false);
  });

  it("shows a bar mid-watch", () => {
    assert.equal(shouldShowProgress(false, 42), true);
  });

  it("shows a full bar for a completed video even without a percentage", () => {
    // Completed videos sometimes carry watchedPercentage 0 (marked watched
    // manually), and they must still read as finished on the thumbnail.
    assert.equal(shouldShowProgress(true, 0), true);
    assert.equal(shouldShowProgress(true, null), true);
  });
});

describe("progress percentage clamping", () => {
  it("clamps out-of-range values into a valid gauge", () => {
    assert.equal(clampPercent(150), 100);
    assert.equal(clampPercent(-20), 0);
    assert.equal(clampPercent(50), 50);
  });

  it("treats junk as zero rather than rendering NaN%", () => {
    assert.equal(clampPercent(Number.NaN), 0);
    assert.equal(clampPercent(Number.POSITIVE_INFINITY), 0);
    assert.equal(clampPercent(null), 0);
    assert.equal(clampPercent(undefined), 0);
  });

  it("rounds fractional percentages", () => {
    assert.equal(clampPercent(33.7), 34);
    assert.equal(clampPercent(33.2), 33);
  });
});
