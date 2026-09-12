import { adminDb } from "@/lib/server/firebase-admin";
import admin from "firebase-admin";

export interface AiQuota {
  dailyLimit: number;
  usedToday: number;
  date: string; // YYYY-MM-DD in the user's local timezone; server-side dates are UTC-safe for counters.
  systemAiEnabled: boolean;
}

export interface SystemAiDefaults {
  defaultDailyLimit: number;
}

export interface SetUserQuotaOverrideInput {
  dailyLimit?: number;
  systemAiEnabled?: boolean;
}

const DEFAULT_DAILY_LIMIT = 5;

export function validateQuotaOverrideInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (b.dailyLimit !== undefined) {
    if (typeof b.dailyLimit !== "number" || !Number.isFinite(b.dailyLimit) || b.dailyLimit < 0) {
      return "dailyLimit must be a non-negative number.";
    }
  }

  if (b.systemAiEnabled !== undefined && typeof b.systemAiEnabled !== "boolean") {
    return "systemAiEnabled must be a boolean.";
  }

  return null;
}

export function validateSystemDefaultsInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (typeof b.defaultDailyLimit !== "number" || !Number.isFinite(b.defaultDailyLimit) || b.defaultDailyLimit < 0) {
    return "defaultDailyLimit must be a non-negative number.";
  }

  return null;
}

export function buildDefaultQuota(defaults?: Partial<SystemAiDefaults>): AiQuota {
  const dailyLimit = Number.isFinite(defaults?.defaultDailyLimit) ? Number(defaults!.defaultDailyLimit) : DEFAULT_DAILY_LIMIT;
  const today = new Date().toISOString().slice(0, 10);
  return {
    dailyLimit: Math.max(0, dailyLimit),
    usedToday: 0,
    date: today,
    systemAiEnabled: true,
  };
}

export function consumeQuotaState(current: AiQuota, todayIso: string): { allowed: boolean; next: AiQuota } {
  const normalized = { ...current };
  const isSameDay = normalized.date === todayIso;
  const base: AiQuota = isSameDay
    ? normalized
    : { ...normalized, usedToday: 0, date: todayIso };

  const allowed = base.usedToday < base.dailyLimit;
  const next: AiQuota = {
    ...base,
    usedToday: allowed ? base.usedToday + 1 : base.usedToday,
    date: todayIso,
  };

  return { allowed, next };
}

function quotaRef(uid: string) {
  return adminDb.collection("users").doc(uid).collection("aiQuota").doc("current");
}

function systemAiDefaultsRef() {
  return adminDb.collection("systemAiSettings").doc("defaults");
}

export async function getSystemAiDefaults(): Promise<SystemAiDefaults> {
  const snap = await systemAiDefaultsRef().get();
  if (!snap.exists) {
    const fallback: SystemAiDefaults = { defaultDailyLimit: DEFAULT_DAILY_LIMIT };
    await systemAiDefaultsRef().set(fallback, { merge: true });
    return fallback;
  }

  const data = snap.data() as Partial<SystemAiDefaults> | undefined;
  const defaultDailyLimit = Number.isFinite(data?.defaultDailyLimit) ? Number(data!.defaultDailyLimit) : DEFAULT_DAILY_LIMIT;
  return { defaultDailyLimit: Math.max(0, defaultDailyLimit) };
}

export async function getOrInitQuota(uid: string): Promise<AiQuota> {
  const current = await quotaRef(uid).get();
  if (current.exists) {
    const existing = current.data() as Partial<AiQuota> | undefined;
    const next = {
      dailyLimit: Number.isFinite(existing?.dailyLimit) ? Number(existing!.dailyLimit) : DEFAULT_DAILY_LIMIT,
      usedToday: Number.isFinite(existing?.usedToday) ? Number(existing!.usedToday) : 0,
      date: typeof existing?.date === "string" ? existing.date : new Date().toISOString().slice(0, 10),
      systemAiEnabled: existing?.systemAiEnabled !== false,
    } satisfies AiQuota;
    return next;
  }

  const defaults = await getSystemAiDefaults();
  const initial = buildDefaultQuota(defaults);
  await quotaRef(uid).set(initial);
  return initial;
}

export async function consumeQuota(uid: string): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const ref = quotaRef(uid);

  let allowed = false;
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? (snap.data() as Partial<AiQuota>) : undefined) ?? {
      dailyLimit: DEFAULT_DAILY_LIMIT,
      usedToday: 0,
      date: today,
      systemAiEnabled: true,
    };

    const nextQuota = consumeQuotaState(
      {
        dailyLimit: Number.isFinite(current.dailyLimit) ? Number(current.dailyLimit) : DEFAULT_DAILY_LIMIT,
        usedToday: Number.isFinite(current.usedToday) ? Number(current.usedToday) : 0,
        date: typeof current.date === "string" ? current.date : today,
        systemAiEnabled: current.systemAiEnabled !== false,
      },
      today
    );

    allowed = nextQuota.allowed;
    tx.set(ref, nextQuota.next, { merge: true });
  });

  return allowed;
}

export async function setUserQuotaOverride(uid: string, input: SetUserQuotaOverrideInput): Promise<AiQuota> {
  const current = await getOrInitQuota(uid);
  const next: AiQuota = {
    ...current,
    dailyLimit: input.dailyLimit !== undefined ? Math.max(0, Number(input.dailyLimit)) : current.dailyLimit,
    systemAiEnabled: input.systemAiEnabled !== undefined ? Boolean(input.systemAiEnabled) : current.systemAiEnabled,
  };

  await quotaRef(uid).set(next, { merge: true });
  return next;
}

export async function setSystemAiDefaults(input: Partial<SystemAiDefaults>): Promise<SystemAiDefaults> {
  const next: SystemAiDefaults = {
    defaultDailyLimit: Number.isFinite(input.defaultDailyLimit)
      ? Math.max(0, Number(input.defaultDailyLimit))
      : DEFAULT_DAILY_LIMIT,
  };

  await systemAiDefaultsRef().set(next, { merge: true });
  return next;
}
