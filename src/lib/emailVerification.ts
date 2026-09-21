/**
 * Pure rules for the email-verification gate and the change-password form, kept free of Firebase
 * and React so they can be unit-tested.
 */

/** Firebase throttles verification emails, and hammering "Resend" only hits that limit. */
export const RESEND_COOLDOWN_MS = 60_000;

export const MIN_PASSWORD_LENGTH = 6;

/**
 * Should this signed-in Firebase user be turned away because their email isn't verified?
 *
 * - Verified users (all Google users, and password users who clicked the link) are never blocked.
 * - Unverified users WITH an existing profile are "grandfathered": they registered before the
 *   verification requirement existed, and locking them out would strand real accounts. They see a
 *   reminder banner instead.
 * - Unverified users WITHOUT a profile are new sign-ups and must verify first.
 */
export function shouldBlockUnverified(input: { emailVerified: boolean; hasProfile: boolean }): boolean {
  return !input.emailVerified && !input.hasProfile;
}

/** Milliseconds until "Resend" is allowed again (0 = allowed now). */
export function resendCooldownRemaining(lastSentAtMs: number, nowMs: number, cooldownMs: number = RESEND_COOLDOWN_MS): number {
  if (!lastSentAtMs) return 0;
  return Math.max(0, lastSentAtMs + cooldownMs - nowMs);
}

/** Validation for the change-password form. Returns an error message, or null when valid. */
export function validateNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "Enter your current password.";
  if (next.length < MIN_PASSWORD_LENGTH) return `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next === current) return "Choose a password that's different from your current one.";
  if (next !== confirm) return "The new passwords don't match.";
  return null;
}
