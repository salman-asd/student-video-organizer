import type { TourDef, TourRecordLike } from "./types";

/** Accounts newer than this may get the welcome tour automatically; older ones only see the chip. */
export const AUTO_RUN_MAX_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A record counts only if it is for this version (or newer). */
export function recordFor(
  records: Record<string, TourRecordLike | undefined> | null | undefined,
  def: Pick<TourDef, "id" | "version">,
): TourRecordLike | null {
  const rec = records?.[def.id];
  return rec && rec.v >= def.version ? rec : null;
}

/** Welcome tour auto-runs once, for new accounts that have finished onboarding. */
export function shouldAutoRunWelcome(input: {
  records: Record<string, TourRecordLike | undefined> | null | undefined;
  def: Pick<TourDef, "id" | "version">;
  createdAtMs: number;
  onboardingDone: boolean;
  now: number;
}): boolean {
  const { records, def, createdAtMs, onboardingDone, now } = input;
  if (!onboardingDone) return false;
  if (recordFor(records, def)) return false;
  // Unknown creation time → treat as an existing account (chip only). Never ambush.
  if (!createdAtMs) return false;
  return now - createdAtMs < AUTO_RUN_MAX_ACCOUNT_AGE_MS;
}

/** The chip is shown until the tour is completed, skipped or dismissed at the current version. */
export function shouldOfferChip(
  records: Record<string, TourRecordLike | undefined> | null | undefined,
  def: Pick<TourDef, "id" | "version">,
): boolean {
  return recordFor(records, def) === null;
}

// ── localStorage mirror (instant + works before the profile loads) ─────────
const key = (uid: string, id: string) => `sl:tour:${uid}:${id}`;

export function readMirror(uid: string, id: string): TourRecordLike | null {
  try {
    const raw = window.localStorage.getItem(key(uid, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TourRecordLike;
    return parsed && typeof parsed.v === "number" && typeof parsed.status === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMirror(uid: string, id: string, record: TourRecordLike | null): void {
  try {
    if (record) window.localStorage.setItem(key(uid, id), JSON.stringify(record));
    else window.localStorage.removeItem(key(uid, id));
  } catch {
    /* private mode — Firestore remains the source of truth */
  }
}
