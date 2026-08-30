"use client";

import * as React from "react";
import YouTube, { type YouTubeProps, type YouTubePlayer } from "react-youtube";

interface Props {
  youtubeVideoId?: string | null;
  videoUrl: string;
  startSeconds?: number;
  onProgress: (currentSeconds: number, durationSeconds: number, force?: boolean) => void;
  onPause: (currentSeconds: number, durationSeconds: number, force?: boolean) => void;
  onEnded: (durationSeconds: number) => void;
}

/**
 * Renders the YouTube IFrame player when a youtubeVideoId is available.
 * For non-YouTube external URLs, falls back to a simple "open externally"
 * card — this app never hosts or proxies video files.
 */
export function VideoPlayer({ youtubeVideoId, videoUrl, startSeconds = 0, onProgress, onPause, onEnded }: Props) {
  const playerRef = React.useRef<YouTubePlayer | null>(null);
  const intervalRef = React.useRef<ReturnType<typeof setInterval>>();
  // The YouTube IFrame API's own internal messaging can throw (its minified
  // code references an internal "M_ID" field) if a player method is called
  // while the player is mid-teardown or mid-video-swap — e.g. an in-flight
  // setInterval tick landing right as the component unmounts, or right as
  // Next/Prev swaps videos. This flag, plus a try/catch around every call
  // into the player, turns that into "skip this one save" instead of an
  // uncaught console error.
  const isMountedRef = React.useRef(true);

  const clearPoll = () => intervalRef.current && clearInterval(intervalRef.current);

  async function safeReadTime(target: YouTubePlayer): Promise<[number, number] | null> {
    if (!isMountedRef.current) return null;
    try {
      const [cur, dur] = await Promise.all([target.getCurrentTime(), target.getDuration()]);
      return [Number(cur), Number(dur)];
    } catch {
      return null;
    }
  }

  // `startSeconds` is fed from the same progress state we save every ~20s,
  // so it changes on every tick. `opts` must NOT be rebuilt on those
  // updates — react-youtube treats a new `opts` object as a real change
  // and reloads/reseeks the underlying iframe player, which pauses
  // playback. We only want the resume position once — at mount, or when
  // the video itself actually changes (e.g. Prev/Next) — so it's captured
  // into a ref synchronously during render (not an effect, which would run
  // one tick too late and hand the memo the previous video's position).
  const lastVideoIdRef = React.useRef<string | null | undefined>(undefined);
  const resumeSecondsRef = React.useRef(startSeconds);
  if (lastVideoIdRef.current !== youtubeVideoId) {
    lastVideoIdRef.current = youtubeVideoId;
    resumeSecondsRef.current = startSeconds;
  }

  const opts: YouTubeProps["opts"] = React.useMemo(() => ({
    width: "100%",
    height: "100%",
    playerVars: {
      start: Math.floor(resumeSecondsRef.current),
      rel: 0,
      modestbranding: 1,
      controls: 1,
      fs: 1,
      playsinline: 1,
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [youtubeVideoId]);

  function handleReady(e: { target: YouTubePlayer }) {
    playerRef.current = e.target;
  }

  function handleStateChange(e: { data: number; target: YouTubePlayer }) {
    const YT_PLAYING = 1;
    const YT_PAUSED = 2;
    const YT_ENDED = 0;

    clearPoll();

    if (e.data === YT_PLAYING) {
      // Periodic save while playing — every 20s, not every second, to
      // minimize Firestore writes (see README > Firestore optimization).
      intervalRef.current = setInterval(async () => {
        const result = await safeReadTime(e.target);
        if (result) onProgress(result[0], result[1]);
      }, 20000);
    }

    if (e.data === YT_PAUSED) {
      // Pausing is a natural checkpoint — force the save so the exact
      // position is captured even if you paused seconds after the last
      // throttled periodic save (otherwise a short viewing session could
      // end without ever persisting real progress).
      safeReadTime(e.target).then((result) => { if (result) onPause(result[0], result[1], true); });
    }

    if (e.data === YT_ENDED) {
      Promise.resolve(e.target.getDuration()).then((dur: number) => onEnded(Number(dur))).catch(() => {});
    }
  }

  // Save on page leave / unmount as a safety net.
  React.useEffect(() => {
    isMountedRef.current = true;
    function handleBeforeUnload() {
      const p = playerRef.current;
      if (!p) return;
      // Same reasoning as the pause handler — this is the last chance to
      // persist progress before the tab/route changes, so it must not be
      // silently dropped by the periodic-save throttle.
      safeReadTime(p).then((result) => { if (result) onProgress(result[0], result[1], true); });
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      clearPoll();
      handleBeforeUnload();
      // Set after the final save is *initiated* (safeReadTime still checks
      // isMountedRef itself before touching the player, but this ensures
      // any subsequent stray call — e.g. a late interval tick that slipped
      // through — is a guaranteed no-op).
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!youtubeVideoId) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-secondary text-center">
        <p className="text-sm text-muted-foreground">This video is hosted externally.</p>
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent underline">
          Open video in a new tab →
        </a>
      </div>
    );
  }

  return (
    <div className="relative z-0 aspect-video w-full overflow-hidden rounded-lg bg-black">
      <YouTube
        videoId={youtubeVideoId}
        opts={opts}
        onReady={handleReady}
        onStateChange={handleStateChange}
        className="h-full w-full"
        iframeClassName="h-full w-full"
      />
    </div>
  );
}
