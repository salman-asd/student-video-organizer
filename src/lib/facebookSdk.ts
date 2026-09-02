"use client";

declare global {
  interface Window {
    FB?: {
      init: (params: Record<string, unknown>) => void;
      XFBML: { parse: (element?: HTMLElement) => void };
    };
    fbAsyncInit?: () => void;
  }
}

const SCRIPT_ID = "facebook-jssdk";
const SDK_VERSION = "v26.0";

let sdkLoadPromise: Promise<void> | null = null;

function ensureFbRoot() {
  if (document.getElementById("fb-root")) return;
  const root = document.createElement("div");
  root.id = "fb-root";
  document.body.prepend(root);
}

/**
 * The Facebook App ID the SDK initializes with, from
 * NEXT_PUBLIC_FACEBOOK_APP_ID. An App ID is not a secret — it's the same
 * value that appears in the URL of every "Login with Facebook" button and
 * every embed snippet Facebook itself generates — unlike
 * FACEBOOK_APP_SECRET (server-only, see FACEBOOK_SETUP.md), so it's fine
 * to bundle into client JS via a NEXT_PUBLIC_ var.
 *
 * This matters because Meta retired anonymous/automated Facebook page
 * embeds on 3 Nov 2025 (see facebookGraph.ts's module doc for the same
 * date affecting oEmbed fields). Initializing the SDK with no App ID at
 * all doesn't throw or reject anything — the script loads fine and
 * FB.init "succeeds" — but the video/Reel plugin can end up simply never
 * rendering its iframe, which looks exactly like a permanently black
 * player with no error to debug from. Configuring this env var is what
 * actually fixes that; the SDK/init code itself was already otherwise
 * correct. Embedding still degrades gracefully without it set (see
 * FacebookEmbed.tsx's fallback card after a few seconds of no iframe
 * appearing), it's just unreliable until it's configured.
 */
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID || undefined;

export function getFacebookAppId(): string | undefined {
  return FACEBOOK_APP_ID;
}

/**
 * Lazily loads Facebook's JavaScript SDK exactly once per page and
 * initializes it via the explicit `window.fbAsyncInit` → `FB.init(...)`
 * pattern Meta's own docs use
 * (developers.facebook.com/docs/plugins/embedded-video-player) — not the
 * `#xfbml=1` URL-fragment shortcut this file used previously, which is
 * less reliable for elements added to the DOM *after* the script's own
 * automatic first pass (e.g. mounting a video after initial page load,
 * or swapping videos via Prev/Next).
 *
 * This exists at all because a bare `plugins/video.php?href=...` iframe —
 * this app's original approach for every Facebook platform, including
 * Reels — doesn't reliably render a Reel: no error, just a black player,
 * even once `href` is the Reel's own correct `/reel/{id}/` URL (see
 * FacebookVideoProvider.canonicalUrl's doc comment in providers.ts for
 * that earlier, necessary-but-not-sufficient shape fix). This SDK-driven
 * player is what's left once that fix alone turned out not to be enough.
 *
 * See FacebookEmbed.tsx for how this is actually used to render a video.
 */
export function loadFacebookSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.FB) {
    console.log("[facebook-video] SDK already loaded (window.FB present)");
    return Promise.resolve();
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  console.log(`[facebook-video] loading Facebook SDK — appId=${FACEBOOK_APP_ID ?? "MISSING (NEXT_PUBLIC_FACEBOOK_APP_ID not set at build time)"}`);

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    ensureFbRoot();

    // fbAsyncInit MUST be assigned before the SDK script executes — the
    // SDK calls it itself once loaded, we don't call it. Chain onto
    // anything already assigned rather than clobbering it, in case
    // something else on the page also uses the Facebook SDK.
    const previousAsyncInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      console.log("[facebook-video] fbAsyncInit fired — calling FB.init()");
      previousAsyncInit?.();
      try {
        window.FB?.init({ appId: FACEBOOK_APP_ID, xfbml: true, version: SDK_VERSION });
        console.log(`[facebook-video] FB.init() completed — window.FB present: ${Boolean(window.FB)}`);
      } catch (err) {
        console.error("[facebook-video] FB.init() threw:", err);
      } finally {
        resolve();
      }
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      console.log("[facebook-video] SDK script tag already present — waiting on its fbAsyncInit");
      // Already injected by an earlier call (or another video on the same
      // page) — if FB is already up, fbAsyncInit already ran and won't
      // fire again, so resolve directly; otherwise the fbAsyncInit
      // assigned above will run once that in-flight script finishes.
      if (window.FB) resolve();
      existing.addEventListener("error", () => reject(new Error("Facebook SDK failed to load")), { once: true });
      return;
    }

    // Deliberately no `crossorigin` attribute — it offers no benefit here
    // (nothing reads the script's response body or needs SRI) and risks
    // the load silently failing if Facebook's CDN doesn't return the
    // matching CORS headers for that specific request mode.
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = (event) => {
      console.error("[facebook-video] SDK script failed to load (network error, blocked domain, or ad blocker) — check the Network tab for connect.facebook.net/en_US/sdk.js:", event);
      reject(new Error("Facebook SDK failed to load"));
    };
    console.log("[facebook-video] injecting SDK script tag:", script.src);
    document.body.appendChild(script);
  }).catch((err) => {
    // Don't cache a permanent rejection — an ad blocker or transient
    // network failure on the first attempt shouldn't doom every later
    // Facebook video on the page too. The next caller gets a fresh try.
    sdkLoadPromise = null;
    throw err;
  });

  return sdkLoadPromise;
}

/**
 * Re-scans `element` (or the whole document if omitted) for unparsed
 * `fb-*` xfbml elements — e.g. `<div class="fb-video" data-href="...">` —
 * and turns them into live embeds. Safe to call repeatedly; already-
 * parsed elements are left alone. No-ops if the SDK hasn't finished
 * loading yet (callers should await loadFacebookSdk() first).
 */
export function parseFacebookXfbml(element?: HTMLElement | null): void {
  if (typeof window === "undefined") return;
  if (!window.FB) {
    console.warn("[facebook-video] parseFacebookXfbml called but window.FB is not defined — the SDK never finished loading/initializing");
    return;
  }
  console.log("[facebook-video] calling FB.XFBML.parse()", element ?? "(whole document)");
  window.FB.XFBML.parse(element ?? undefined);
}
