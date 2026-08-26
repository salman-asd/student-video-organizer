"use client";

import * as React from "react";
import YouTube, { type YouTubeProps, type YouTubePlayer } from "react-youtube";

interface Props {
  youtubeVideoId?: string | null;
  videoUrl: string;
  startSeconds?: number;
  onProgress: (currentSeconds: number, durationSeconds: number) => void;
  onPause: (currentSeconds: number, durationSeconds: number) => void;
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

  const opts: YouTubeProps["opts"] = {
    width: "100%",
    height: "100%",
    playerVars: { start: Math.floor(startSeconds), rel: 0, modestbranding: 1 },
  };

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
        const cur = await e.target.getCurrentTime();
        const dur = await e.target.getDuration();
        onProgress(cur, dur);
      }, 20000);
    }

    if (e.data === YT_PAUSED) {
      Promise.all([e.target.getCurrentTime(), e.target.getDuration()]).then(([cur, dur]) => onPause(cur, dur));
    }

    if (e.data === YT_ENDED) {
      e.target.getDuration().then((dur) => onEnded(dur));
    }
  }

  // Save on page leave / unmount as a safety net.
  React.useEffect(() => {
    function handleBeforeUnload() {
      const p = playerRef.current;
      if (!p) return;
      Promise.all([p.getCurrentTime(), p.getDuration()]).then(([cur, dur]) => onProgress(cur, dur));
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
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <YouTube videoId={youtubeVideoId} opts={opts} onReady={handleReady} onStateChange={handleStateChange} className="h-full w-full" iframeClassName="h-full w-full" />
    </div>
  );
}
