import {
  getActiveConnectionRaw as getPersonalConnectionRaw,
  recordConnectionFailure as recordPersonalConnectionFailure,
  recordTestResult as recordPersonalTestResult,
} from "@/lib/server/aiConnections";
import {
  getActiveConnectionRaw as getSystemConnectionRaw,
  recordConnectionFailure as recordSystemConnectionFailure,
  recordTestResult as recordSystemTestResult,
} from "@/lib/server/systemAiConnections";
import { decryptApiKey } from "@/lib/server/aiEncryption";
import { consumeQuota, getOrInitQuota } from "@/lib/server/aiQuota";
import { AiServiceError, type AiErrorCode } from "@/lib/ai/errors";
import type { AiProvider } from "@/types";

const FALLBACK_CODES = new Set<AiErrorCode>([
  "auth",
  "rate_limit",
  "timeout",
  "network",
  "server_error",
]);

export interface ResolveAiConnectionDeps {
  getPersonalConnectionRaw: typeof getPersonalConnectionRaw;
  getSystemConnectionRaw: typeof getSystemConnectionRaw;
  consumeQuota: typeof consumeQuota;
  decryptApiKey: typeof decryptApiKey;
  recordPersonalTestResult: typeof recordPersonalTestResult;
  recordPersonalConnectionFailure: typeof recordPersonalConnectionFailure;
  recordSystemTestResult: typeof recordSystemTestResult;
  recordSystemConnectionFailure: typeof recordSystemConnectionFailure;
}

const defaultDeps: ResolveAiConnectionDeps = {
  getPersonalConnectionRaw,
  getSystemConnectionRaw,
  consumeQuota,
  decryptApiKey,
  recordPersonalTestResult,
  recordPersonalConnectionFailure,
  recordSystemTestResult,
  recordSystemConnectionFailure,
};

export async function withAiConnection<T>(
  uid: string,
  attempt: (apiKey: string, provider: AiProvider, model: string) => Promise<T>,
  deps: Partial<ResolveAiConnectionDeps> = {}
): Promise<T> {
  const resolved = { ...defaultDeps, ...deps };
  const personalTried = new Set<string>();
  const systemTried = new Set<string>();
  let lastPersonalError: AiServiceError | null = null;

  const quota = await getOrInitQuota(uid).catch(() => null);
  if (quota && quota.systemAiEnabled === false) {
    throw new AiServiceError(
      "rate_limit",
      "System AI access is disabled for this account. Add your own API key in Settings or ask an admin to enable system AI access."
    );
  }

  while (true) {
    const personalConnection = await resolved.getPersonalConnectionRaw!(uid, undefined, personalTried);
    if (personalConnection) {
      personalTried.add(personalConnection.id);
      try {
        return await runAttemptWithConnection(personalConnection, attempt, "personal", uid, resolved);
      } catch (err) {
        if (!(err instanceof AiServiceError)) throw err;
        lastPersonalError = err;
        if (!FALLBACK_CODES.has(err.code)) throw err;
      }
      continue;
    }

    const quotaAllowed = await resolved.consumeQuota!(uid);
    if (!quotaAllowed) {
      throw new AiServiceError(
        "rate_limit",
        "No active AI connection is available for your account, and your system AI quota is exhausted. Add your own API key in Settings or ask an admin for more quota."
      );
    }

    const systemConnection = await resolved.getSystemConnectionRaw!(undefined, systemTried);
    if (!systemConnection) {
      if (lastPersonalError) {
        throw new AiServiceError(
          "rate_limit",
          "No system AI connection is available for your account. Add your own API key in Settings or ask an admin for more quota."
        );
      }
      throw new AiServiceError(
        "rate_limit",
        "No active AI connection is available. Add your own API key in Settings or ask an admin for more quota."
      );
    }

    systemTried.add(systemConnection.id);
    try {
      return await runAttemptWithConnection(systemConnection, attempt, "system", undefined, resolved);
    } catch (err) {
      if (!(err instanceof AiServiceError)) throw err;
      if (!FALLBACK_CODES.has(err.code)) throw err;
      const quotaStillAllowed = await resolved.consumeQuota!(uid).catch(() => false);
      if (!quotaStillAllowed) {
        throw new AiServiceError(
          "rate_limit",
          "Your system AI quota is exhausted. Add your own API key in Settings or ask an admin for more quota."
        );
      }
    }
  }
}

async function runAttemptWithConnection<T>(
  connection: { id: string; provider: AiProvider; model: string; encryptedApiKey: string },
  attempt: (apiKey: string, provider: AiProvider, model: string) => Promise<T>,
  kind: "personal" | "system",
  uid: string | undefined,
  deps: ResolveAiConnectionDeps
): Promise<T> {
  let apiKey: string;
  try {
    apiKey = deps.decryptApiKey(connection.encryptedApiKey);
  } catch (err) {
    console.error(`Failed to decrypt ${kind} AI connection`, err);
    throw new AiServiceError(
      "auth",
      kind === "personal"
        ? "Could not read your saved AI key. Add it again in Settings."
        : "Could not read the saved system AI key. Ask an admin to reconfigure it."
    );
  }

  try {
    const result = await attempt(apiKey, connection.provider, connection.model);
    if (kind === "personal" && uid) {
      await deps.recordPersonalTestResult(uid, connection.id, { success: true }).catch(() => undefined);
    } else {
      await deps.recordSystemTestResult(connection.id, { success: true }).catch(() => undefined);
    }
    return result;
  } catch (err: unknown) {
    if (err instanceof AiServiceError) {
      if (kind === "personal" && uid) {
        if (err.code === "auth" || err.code === "rate_limit") {
          await deps.recordPersonalConnectionFailure(uid, connection.id, err.code).catch(() => undefined);
        }
      } else if (err.code === "auth" || err.code === "rate_limit") {
        await deps.recordSystemConnectionFailure(connection.id, err.code).catch(() => undefined);
      }
      throw err;
    }
    throw new AiServiceError("unknown", `Something went wrong while trying the ${kind} AI provider.`);
  }
}
