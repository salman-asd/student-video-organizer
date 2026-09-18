"use client";

import * as React from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one video-thumbnail component.
 *
 * Every surface that shows a video thumbnail should use this — grid cards,
 * list rows, the playlist sidebar, the "up next" list, and the dashboard.
 * Two things kept drifting when each surface did its own <Image>:
 *
 *   1. Watch-progress indicator. VideoCard drew a bar *on* the thumbnail,
 *      ContinueWatchingCard drew one *below* it, PlaylistVideoRow drew one,
 *      and VideoListRow (Watch Later / Priority) drew none at all. So the same
 *      partially-watched video looked different depending on which page you
 *      were on.
 *   2. Broken-thumbnail handling. Every one of them rendered <Image> directly,
 *      so a dead YouTube URL, a deleted personal upload, or a thumbnail that
 *      simply never got scraped produced the browser's broken-image glyph on
 *      a background-coloured box — or, with next/image, an error that could
 *      blank the whole card.
 *
 * Standardizing on ONE treatment (the thin bar across the bottom of the
 * thumbnail, which VideoCard already used) plus one fallback makes both
 * impossible to reintroduce per-surface.
 */

export interface VideoThumbnailProps {
  src?: string | null;
  alt: string;
  /**
   * The video's page URL, used to decide whether to bypass the optimizer.
   * Hosts like Facebook's CDN reject Next's server-side fetch (403/hotlink
   * protection) while still serving the browser fine, so those must be loaded
   * directly.
   */
  videoUrl?: string | null;
  /** 0-100. Values <= 0 render no bar. Values >= 100 render a full bar in the
   *  "completed" tone, so a finished video still reads as finished even when
   *  the caller doesn't pass `completed`. */
  progressPercent?: number | null;
  /** Renders a distinct completed state (checkmark overlay + full bar). */
  completed?: boolean;
  /** Shown in the fallback when the image fails; kept for alt text. */
  title?: string;
  className?: string;
  /** next/image `sizes` — pass the real layout width so the browser picks an
   *  appropriately-sized source instead of downloading the largest one. */
  sizes?: string;
  priority?: boolean;
  /** Overlay content (duration badge, platform badge, priority dot…). */
  children?: React.ReactNode;
  /** Slot for a drag handle or similar absolutely-positioned control. */
  overlayStart?: React.ReactNode;
}

export function VideoThumbnail({
  src,
  alt,
  videoUrl,
  progressPercent = 0,
  completed = false,
  title,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw",
  priority = false,
  children,
  overlayStart,
}: VideoThumbnailProps) {
  const [failed, setFailed] = React.useState(false);

  // A thumbnail URL can change (video edited, re-scraped) while the component
  // stays mounted. Without this reset, one failed load would permanently
  // poison the component and the new, working URL would never be attempted.
  const lastSrc = React.useRef(src);
  React.useEffect(() => {
    if (lastSrc.current !== src) {
      lastSrc.current = src;
      setFailed(false);
    }
  }, [src]);

  const hasSrc = typeof src === "string" && src.trim().length > 0;
  const showFallback = !hasSrc || failed;

  const pct = clampPercent(progressPercent);
  const showProgress = completed || pct > 0;

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-secondary", className)}>
      {showFallback ? (
        <ThumbnailFallback title={title || alt} expired={hasExpiredSignedUrl(src)} />
      ) : (
        <Image
          // IMPORTANT: never rewrite this URL. Facebook/Instagram thumbnails are
          // cryptographically signed (`oh=`) with an embedded expiry (`oe=`), and
          // the signature covers the full URL including its query string — so
          // appending even a harmless-looking cache-buster invalidates it and
          // guarantees a 403. An earlier revision retried with `?_thumbRetry=N`
          // and broke these URLs that way.
          src={src as string}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          // Load Facebook/Instagram thumbnails straight from the browser rather
          // than through the image optimizer. See needsUnoptimizedLoad for why.
          unoptimized={skipOptimizer(src as string, videoUrl)}
          // No referrer is the other half of the hotlink workaround, and is
          // harmless for YouTube/self-hosted images.
          referrerPolicy={skipOptimizer(src as string, videoUrl) ? "no-referrer" : undefined}
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          onError={() => setFailed(true)}
        />
      )}

      {overlayStart}

      {children}

      {showProgress && <ProgressBar percent={completed ? 100 : pct} completed={completed} />}
    </div>
  );
}

/**
 * The thin bar drawn across the bottom of the thumbnail.
 *
 * Rendered as a plain div pair rather than going through ui/progress, because
 * the completed state needs a different indicator colour and Progress's
 * indicator hard-codes `bg-accent` — overriding it from outside would depend
 * on CSS source order. Two divs are simpler than a specificity fight.
 */
function ProgressBar({ percent, completed }: { percent: number; completed: boolean }) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 h-1 w-full overflow-hidden bg-black/30"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={completed ? "Watched" : "Watch progress"}
    >
      <div
        className={cn("h-full transition-[width] duration-500 ease-out", completed ? "bg-success" : "bg-accent")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * Fallback shown when a thumbnail is missing or fails to load.
 *
 * Deliberately looks intentional rather than empty: a muted panel with a
 * play/image glyph and the video's initial, so a row of broken thumbnails
 * reads as "these need attention" instead of "the app is broken". The title
 * is exposed to assistive tech so the fallback is not a silent void.
 */
function ThumbnailFallback({ title, expired = false }: { title: string; expired?: boolean }) {
  const initial = React.useMemo(() => {
    const trimmed = (title || "").trim();
    return trimmed ? trimmed[0].toUpperCase() : "?";
  }, [title]);

  const label = title
    ? `${title} — thumbnail ${expired ? "link has expired" : "unavailable"}`
    : "Thumbnail unavailable";

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted text-muted-foreground"
      role="img"
      aria-label={label}
      title={expired ? "The saved thumbnail link expired — re-import the video to refresh it." : undefined}
    >
      <ImageOff className="h-8 w-8 opacity-80" aria-hidden />
      <span className="select-none text-xs font-semibold uppercase tracking-wider opacity-60">
        {initial}
      </span>
    </div>
  );
}

/**
 * Hosts that reject server-side (optimizer) fetches but serve browsers fine.
 *
 * Next's optimizer fetches the thumbnail from the server. Facebook's CDN
 * rejects those requests (datacenter IP + referer), so the optimized URL 403s,
 * while the browser loading the original URL directly is allowed. Bypassing the
 * optimizer restores the direct load these hosts expect.
 *
 * `videoUrl` is also consulted so a Facebook *video* whose thumbnail happens
 * to sit on another host still gets the direct-load treatment.
 *
 * NOTE: this only helps when the stored URL is still valid. Facebook thumbnail
 * URLs are signed (`oh=`) and expire (`oe=`, a unix timestamp in hex) — once
 * expired the CDN 403s every request regardless of how it's loaded, and the
 * only real fix is re-scraping a fresh URL from the platform. The caller shows
 * the fallback in that case. See hasExpiredSignedUrl below.
 */
export function skipOptimizer(src: string, videoUrl?: string | null): boolean {
  const candidates = `${src} ${videoUrl ?? ""}`.toLowerCase();
  return (
    candidates.includes("fbcdn.net") ||
    candidates.includes("fbsbx.com") ||
    candidates.includes("facebook.com") ||
    candidates.includes("fb.watch") ||
    candidates.includes("instagram.com") ||
    candidates.includes("cdninstagram.com")
  );
}

/**
 * Reads Facebook's own `oe=` expiry parameter out of a signed CDN URL.
 *
 * `oe` is a unix timestamp in hex. This exists purely so the UI can explain
 *why* a thumbnail is missing ("the saved link expired") instead of showing a
 * generic failure — and so a future re-fetch job knows which URLs need
 * refreshing. Returns null when the URL has no recognizable expiry.
 *
 * Deliberately never used to modify the URL: the `oh=` signature covers the
 * full string, so any edit invalidates it.
 */
export function signedUrlExpiry(src: string | null | undefined, now: Date = new Date()): Date | null {
  if (!src) return null;
  const match = src.match(/[?&]oe=([0-9A-Fa-f]+)/);
  if (!match) return null;
  const seconds = Number.parseInt(match[1], 16);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}

/** True when a signed URL's own expiry has already passed. */
export function hasExpiredSignedUrl(src: string | null | undefined, now: Date = new Date()): boolean {
  const expiry = signedUrlExpiry(src, now);
  return expiry !== null && expiry.getTime() < now.getTime();
}

function clampPercent(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
