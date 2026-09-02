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
  className?: string;
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
export function FacebookEmbed({ href, videoUrl, className }: Props) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = React.useState(false);
  const appId = getFacebookAppId();

  React.useEffect(() => {
    let cancelled = false;
    const normalizeEmbedSize = () => {
      const iframe = containerRef.current?.querySelector("iframe");
      if (!iframe) return;

      iframe.style.width = "100%";
      iframe.style.height = "auto";
      iframe.style.maxHeight = "none";
      iframe.style.display = "block";

      const parent = iframe.parentElement;
      if (parent) {
        parent.style.height = "auto";
        parent.style.maxHeight = "none";
        parent.style.overflow = "visible";
      }

      const root = containerRef.current;
      if (root) {
        root.style.height = "auto";
        root.style.maxHeight = "none";
        root.style.overflow = "visible";
      }
    };

    const runNormalization = () => {
      const frame = containerRef.current?.querySelector("iframe");
      if (frame) {
        normalizeEmbedSize();
        return;
      }
      const timer = window.setTimeout(normalizeEmbedSize, 200);
      return () => window.clearTimeout(timer);
    };

    console.log(`[facebook-video] FacebookEmbed mounting for href="${href}" appId=${appId ?? "(none)"}`);

    loadFacebookSdk()
      .then(() => {
        if (!cancelled) {
          parseFacebookXfbml(containerRef.current);
          const cleanup = runNormalization();
          if (cleanup) {
            const cleanupTimer = window.setTimeout(cleanup, 1500);
            return () => {
              window.clearTimeout(cleanupTimer);
              cleanup();
            };
          }
        }
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
      <div className={['flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl bg-secondary text-center', className].filter(Boolean).join(' ')}>
        <p className="text-sm text-muted-foreground">This video is hosted externally.</p>
        <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-accent underline">
          Open video in a new tab →
        </a>
      </div>
    );
  }

  return (
    <div className={['relative z-0 mx-auto flex w-full items-center justify-center overflow-visible rounded-xl bg-black shadow-sm', className].filter(Boolean).join(' ')}>
      {/* We do not know portrait vs. landscape ahead of time. The embed
         should size itself to its own intrinsic ratio, so we constrain only
         width and never assume a fixed height. */}
      <div ref={containerRef} className="w-full max-w-full overflow-visible">
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
