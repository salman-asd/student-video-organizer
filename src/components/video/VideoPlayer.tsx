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

  const clearPoll = () => intervalRef.current && clearInterval(intervalRef.current);

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
        const cur = Number(await e.target.getCurrentTime());
        const dur = Number(await e.target.getDuration());
        onProgress(cur, dur);
      }, 20000);
    }

    if (e.data === YT_PAUSED) {
      // Pausing is a natural checkpoint — force the save so the exact
      // position is captured even if you paused seconds after the last
      // throttled periodic save (otherwise a short viewing session could
      // end without ever persisting real progress).
      Promise.all([e.target.getCurrentTime(), e.target.getDuration()]).then(([cur, dur]: [number, number]) => onPause(cur, dur, true));
    }

    if (e.data === YT_ENDED) {
      e.target.getDuration().then((dur: number) => onEnded(dur));
    }
  }

  // Save on page leave / unmount as a safety net.
  React.useEffect(() => {
    function handleBeforeUnload() {
      const p = playerRef.current;
      if (!p) return;
      // Same reasoning as the pause handler — this is the last chance to
      // persist progress before the tab/route changes, so it must not be
      // silently dropped by the periodic-save throttle.
      Promise.all([p.getCurrentTime(), p.getDuration()]).then(([cur, dur]: [number, number]) => onProgress(cur, dur, true));
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
      clearPoll();
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