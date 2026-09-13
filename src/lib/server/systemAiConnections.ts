import { adminDb } from "@/lib/server/firebase-admin";
import { encryptApiKey, maskApiKey } from "@/lib/server/aiEncryption";
import { AI_PROVIDERS, type AiConnection, type AiConnectionSummary, type AiProvider } from "@/types";
import admin from "firebase-admin";

const LABEL_MAX_LENGTH = 200;
const MODEL_MAX_LENGTH = 200;
const API_KEY_MAX_LENGTH = 1000;

export interface CreateConnectionInput {
  provider: AiProvider;
  apiKey: string;
  model: string;
  label: string;
}

export interface UpdateConnectionInput {
  apiKey?: string;
  model?: string;
  label?: string;
  priority?: number;
  isActive?: boolean;
}

export function validateCreateInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (!AI_PROVIDERS.includes(b.provider as AiProvider)) {
    return `provider must be one of: ${AI_PROVIDERS.join(", ")}`;
  }
  if (typeof b.apiKey !== "string" || !b.apiKey.trim()) return "apiKey is required.";
  if (b.apiKey.length > API_KEY_MAX_LENGTH) return "apiKey is too long.";
  if (typeof b.model !== "string" || !b.model.trim()) return "model is required.";
  if (b.model.length > MODEL_MAX_LENGTH) return "model is too long.";
  if (typeof b.label !== "string" || !b.label.trim()) return "label is required.";
  if (b.label.length > LABEL_MAX_LENGTH) return "label is too long.";

  return null;
}

export function validateUpdateInput(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (b.apiKey !== undefined) {
    if (typeof b.apiKey !== "string" || !b.apiKey.trim()) return "apiKey must be a non-empty string.";
    if (b.apiKey.length > API_KEY_MAX_LENGTH) return "apiKey is too long.";
  }
  if (b.model !== undefined) {
    if (typeof b.model !== "string" || !b.model.trim()) return "model must be a non-empty string.";
    if (b.model.length > MODEL_MAX_LENGTH) return "model is too long.";
  }
  if (b.label !== undefined) {
    if (typeof b.label !== "string" || !b.label.trim()) return "label must be a non-empty string.";
    if (b.label.length > LABEL_MAX_LENGTH) return "label is too long.";
  }
  if (b.priority !== undefined && (typeof b.priority !== "number" || !Number.isFinite(b.priority))) {
    return "priority must be a finite number.";
  }
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") return "isActive must be a boolean.";

  return null;
}

function connectionsRef() {
  return adminDb.collection("systemAiConnections");
}

function toIso(value: admin.firestore.Timestamp | null | undefined): string | null {
  return value ? value.toDate().toISOString() : null;
}

function toSummary(id: string, data: admin.firestore.DocumentData): AiConnectionSummary {
  return {
    id,
    provider: data.provider,
    model: data.model,
    label: data.label,
    priority: data.priority ?? 0,
    isActive: data.isActive ?? true,
    status: data.status ?? "active",
    maskedKey: data.maskedKey,
    lastUsedAt: toIso(data.lastUsedAt),
    lastSuccessAt: toIso(data.lastSuccessAt),
    lastFailureAt: toIso(data.lastFailureAt),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

export async function listConnections(): Promise<AiConnectionSummary[]> {
  const snap = await connectionsRef().orderBy("priority", "asc").get();
  return snap.docs.map((doc) => toSummary(doc.id, doc.data()));
}

export async function createConnection(input: CreateConnectionInput): Promise<AiConnectionSummary> {
  const ref = connectionsRef().doc();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const existing = await connectionsRef().count().get();
  const priority = existing.data().count;

  const doc: Omit<AiConnection, "id"> = {
    provider: input.provider,
    encryptedApiKey: encryptApiKey(input.apiKey),
    maskedKey: maskApiKey(input.apiKey),
    model: input.model.trim(),
    label: input.label.trim(),
    priority,
    isActive: true,
    status: "active",
    cooldownUntil: null,
    lastUsedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    createdAt: now as any,
    updatedAt: now as any,
  };

  await ref.set(doc);
  const snap = await ref.get();
  return toSummary(snap.id, snap.data()!);
}

export async function updateConnection(
  connectionId: string,
  input: UpdateConnectionInput
): Promise<AiConnectionSummary | null> {
  const ref = connectionsRef().doc(connectionId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const patch: Record<string, unknown> = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (input.model !== undefined) patch.model = input.model.trim();
  if (input.label !== undefined) patch.label = input.label.trim();
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  if (input.apiKey !== undefined) {
    patch.encryptedApiKey = encryptApiKey(input.apiKey);
    patch.maskedKey = maskApiKey(input.apiKey);
    patch.status = "active";
    patch.cooldownUntil = null;
  }

  await ref.update(patch);
  const updated = await ref.get();
  return toSummary(updated.id, updated.data()!);
}

export async function deleteConnection(connectionId: string): Promise<boolean> {
  const ref = connectionsRef().doc(connectionId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

export async function getConnectionRaw(connectionId: string): Promise<(AiConnection & { id: string }) | null> {
  const snap = await connectionsRef().doc(connectionId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<AiConnection, "id">) };
}

export async function getActiveConnectionRaw(
  provider?: AiProvider,
  excludedIds: ReadonlySet<string> = new Set()
): Promise<(AiConnection & { id: string }) | null> {
  const snap = await connectionsRef().get();
  const now = Date.now();
  const usable = snap.docs.filter((d) => {
    if (excludedIds.has(d.id)) return false;
    const data = d.data();
    if (data.isActive !== true) return false;
    if (provider && data.provider !== provider) return false;
    if (data.status === "invalid") return false;
    if (data.status !== "cooldown") return true;
    const cooldownUntil = data.cooldownUntil as admin.firestore.Timestamp | null | undefined;
    return !cooldownUntil || cooldownUntil.toMillis() <= now;
  });
  usable.sort((left, right) => (left.data().priority ?? 0) - (right.data().priority ?? 0));
  const doc = usable[0];
  if (!doc) return null;
  return { id: doc.id, ...(doc.data() as Omit<AiConnection, "id">) };
}

export async function recordTestResult(connectionId: string, result: { success: boolean }): Promise<void> {
  const ref = connectionsRef().doc(connectionId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.update(
    result.success
      ? { status: "active", lastUsedAt: now, lastSuccessAt: now, cooldownUntil: null }
      : { status: "invalid", lastUsedAt: now, lastFailureAt: now }
  );
}

const RATE_LIMIT_COOLDOWN_MS = 60_000;

export async function recordConnectionFailure(connectionId: string, code: "auth" | "rate_limit"): Promise<void> {
  const ref = connectionsRef().doc(connectionId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.update(
    code === "auth"
      ? { status: "invalid", lastUsedAt: now, lastFailureAt: now }
      : {
          status: "cooldown",
          cooldownUntil: admin.firestore.Timestamp.fromMillis(Date.now() + RATE_LIMIT_COOLDOWN_MS),
          lastUsedAt: now,
          lastFailureAt: now,
        }
  );
}
