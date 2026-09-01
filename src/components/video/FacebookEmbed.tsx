"use client";

import * as React from "react";
import { getFacebookAppId, loadFacebookSdk, parseFacebookXfbml } from "@/lib/facebookSdk";

interface Props {
  /** The Reel- or Watch-shaped canonical Facebook URL to embed (see
   *  FacebookVideoProvider.canonicalUrl). Must stay Reel/watch-accurate —
   *  see this component's doc comment. */
  href: string;
  /** The original video URL, used only for the "open externally" fallback
   *  link if the embed never renders. */
  videoUrl: string;
}

/**
 * Renders a Facebook video or Reel via Meta's "Embedded Video Player"
 * plugin — a `fb-video` xfbml element parsed by the Facebook JS SDK —
 * instead of a bare `plugins/video.php` iframe. See loadFacebookSdk's doc
 * comment for why: the iframe approach silently renders a black player
 * for Reels no matter which URL shape it's given, while this is the
 * mechanism Meta's own Reel "Embed" button generates code for.
 *
 * A `data-app-id` is included on the `fb-video` element whenever
 * NEXT_PUBLIC_FACEBOOK_APP_ID is configured (see getFacebookAppId's doc
 * comment for why that env var matters here) — this is the single
 * highest-impact factor in whether the plugin actually renders anything
 * post Meta's Nov 2025 retirement of anonymous automated embeds, more so
 * than anything else in this component.
 *
 * Mount this with `key={href}` at the call site (VideoPlayer.tsx does).
 * The SDK converts the `fb-video` div into an iframe in place and has no
 * API to "re-target" an already-converted element at a different video,
 * so a plain prop change on `href` wouldn't do anything — remounting via
 * `key` guarantees the SDK always gets a fresh, unparsed div for whichever
 * video is current (e.g. across Prev/Next in a playlist).
 */
export function FacebookEmbed({ href, videoUrl }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const appId = getFacebookAppId();

  React.useEffect(() => {
    let cancelled = false;
    console.log(`[facebook-video] FacebookEmbed mounting for href="${href}" appId=${appId ?? "(none)"}`);

    loadFacebookSdk()
      .then(() => {
        if (!cancelled) parseFacebookXfbml(containerRef.current);
      })
      .catch((err) => {
        console.error("[facebook-video] failed to load the Facebook SDK for playback:", err);
        if (!cancelled) setFailed(true);
      });

    // The SDK has no "this specific fb-video finished rendering" callback
    // (or failed to — e.g. a removed/private video, no App ID configured
    // — see getFacebookAppId — or an ad blocker silently dropping
    // connect.facebook.net entirely). Give it a generous window, then
    // check whether it actually produced an iframe; if not, fall back to
    // the same "open externally" card used for platforms with no in-app
    // embed, rather than leaving a permanently blank black box with no
    // way out.
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const rendered = Boolean(containerRef.current?.querySelector("iframe"));
      console.log(
        `[facebook-video] 6s check for href="${href}": iframe rendered=${rendered}. Container HTML:`,
        containerRef.current?.innerHTML
      );
      if (!rendered) {
        if (!appId) {
          console.warn(
            "[facebook-video] Facebook embed did not render within 6s and NEXT_PUBLIC_FACEBOOK_APP_ID is not configured — Meta's Nov 2025 policy change means the plugin often fails silently without one. See FACEBOOK_SETUP.md."
          );
        }
        console.warn(
          `[facebook-video] Facebook embed did not render for "${href}" — also check: (1) an ad blocker or privacy extension blocking connect.facebook.net, (2) testing on localhost/a private IP, which Facebook's plugin does not reliably serve to, (3) the video/Reel being private or removed, (4) the "[facebook-video]" logs above this one for exactly where the SDK loading/init sequence stopped.`
        );
        setFailed(true);
      }
    }, 6000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [href, appId]);

  if (failed) {
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
    <div className="relative z-0 flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded-lg bg-black">
      {/* No forced 16:9 aspect box here on purpose — Reels are vertical
         (9:16), and the SDK sizes the rendered iframe to the source
         video's real aspect ratio via data-width="auto"; forcing 16:9
         would just crop or letterbox a portrait Reel. */}
      <div ref={containerRef} className="w-full">
        <div
          className="fb-video"
          data-href={href}
          data-width="auto"
          data-show-text="false"
          data-allowfullscreen="true"
          {...(appId ? { "data-app-id": appId } : {})}
        />
      </div>
    </div>
  );
}
