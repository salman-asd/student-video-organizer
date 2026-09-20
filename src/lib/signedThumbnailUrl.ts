/**
 * Helpers for CDN thumbnail URLs that are cryptographically signed and expire.
 *
 * Facebook/Instagram thumbnails carry `oh=` (a signature over the FULL URL)
 * and `oe=` (expiry, unix seconds in hex). Once `oe` passes, the CDN returns
 * 403 no matter how the image is requested, and the only fix is to obtain a
 * fresh URL from the platform. These helpers exist so the app can *predict*
 * that (and refresh before the user ever sees a broken tile) instead of only
 * reacting to an <img> error.
 *
 * Pure and dependency-free on purpose: usable from client components, hooks,
 * server routes and node:test alike. They NEVER modify the URL — the `oh=`
 * signature covers the whole string, so even a cache-buster invalidates it.
 */

/** Reads the `oe=` expiry out of a signed CDN URL, or null if there is none. */
export function signedUrlExpiry(src: string | null | undefined, _now: Date = new Date()): Date | null {
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

/** True when a signed URL is expired OR will expire within `withinMs`.
 *  Lets a refresh run *before* the tile breaks. */
export function isExpiredOrExpiringSoon(
  src: string | null | undefined,
  now: Date = new Date(),
  withinMs: number = 48 * 60 * 60 * 1000,
): boolean {
  const expiry = signedUrlExpiry(src, now);
  return expiry !== null && expiry.getTime() < now.getTime() + withinMs;
}
