import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { getActiveConnectionRaw, recordConnectionFailure, recordTestResult } from "@/lib/server/aiConnections";
import { decryptApiKey } from "@/lib/server/aiEncryption";
import { generateVideoSummary, AiServiceError, type AiErrorCode } from "@/lib/ai/aiService";
import { getYouTubeTranscript, TranscriptUnavailableError } from "@/lib/ai/transcript";
import { getAiPreferences } from "@/lib/server/aiPreferences";

const TITLE_MAX_LENGTH = 300;
const DESCRIPTION_MAX_LENGTH = 5000;

// HTTP status per AiServiceError code. Kept local to this route rather than
// in the AI service itself — the service is meant to be usable outside an
// HTTP context too, so it shouldn't know about status codes.
const STATUS_BY_CODE: Record<AiErrorCode, number> = {
  auth: 400,
  rate_limit: 429,
  invalid_request: 502,
  blocked: 422,
  timeout: 504,
  network: 502,
  server_error: 502,
  unsupported_provider: 400,
  unknown: 500,
};

// POST /api/ai/summary — generate a transcript-backed summary draft.
// Body: { title, description?, youtubeVideoId }.
// Returns { summary: string }. Does NOT touch Firestore's summary
// collection — the caller is responsible for putting the returned text into
// the existing summary textarea/state and saving it via the existing
// save/autosave path (see src/app/video/[videoId]/page.tsx).
export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  if (b.title !== undefined && typeof b.title !== "string") {
    return NextResponse.json({ error: "title must be a string when provided." }, { status: 400 });
  }
  if (typeof b.title === "string" && b.title.length > TITLE_MAX_LENGTH) {
    return NextResponse.json({ error: "title is too long." }, { status: 400 });
  }
  if (b.description !== undefined && b.description !== null) {
    if (typeof b.description !== "string") {
      return NextResponse.json({ error: "description must be a string." }, { status: 400 });
    }
    if (b.description.length > DESCRIPTION_MAX_LENGTH) {
      return NextResponse.json({ error: "description is too long." }, { status: 400 });
    }
  }
  if (typeof b.youtubeVideoId !== "string" || !b.youtubeVideoId.trim()) {
    return NextResponse.json({ error: "A YouTube video ID is required for transcript-based summaries." }, { status: 400 });
  }

  let transcript: string;
  try {
    transcript = await getYouTubeTranscript(b.youtubeVideoId.trim());
  } catch (error) {
    if (error instanceof TranscriptUnavailableError) {
      const preferences = await getAiPreferences(uid).catch(() => ({ speechToTextEnabled: false }));
      return NextResponse.json(
        {
          error: preferences.speechToTextEnabled
            ? "No YouTube transcript is available. Speech-to-text fallback is enabled, but no transcription service is configured yet."
            : "No YouTube transcript or captions are available. Enable speech-to-text fallback in AI Settings once a transcription service is configured.",
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ error: "Unable to retrieve the YouTube transcript." }, { status: 502 });
  }

  const fallbackCodes = new Set<AiServiceError["code"]>([
    "auth",
    "rate_limit",
    "timeout",
    "network",
    "server_error",
  ]);
  let lastError: AiServiceError | null = null;
  const attemptedConnectionIds = new Set<string>();

  while (true) {
    const connection = await getActiveConnectionRaw(uid, undefined, attemptedConnectionIds);
    if (!connection) {
      if (lastError) {
        return NextResponse.json({ error: lastError.message }, { status: STATUS_BY_CODE[lastError.code] });
      }
      return NextResponse.json(
        { error: "No active AI connection found. Add one in AI Settings first." },
        { status: 400 }
      );
    }

    attemptedConnectionIds.add(connection.id);
    let apiKey: string;
    try {
      apiKey = decryptApiKey(connection.encryptedApiKey);
    } catch (err) {
      console.error("Failed to decrypt AI connection for summary generation", err);
      return NextResponse.json(
        { error: "Could not read your AI connection's stored key. Try re-adding it in AI Settings." },
        { status: 500 }
      );
    }

    try {
      const summary = await generateVideoSummary(
        { provider: connection.provider, apiKey, model: connection.model },
        { title: b.title, description: (b.description as string | undefined) ?? null, transcript }
      );
      await recordTestResult(uid, connection.id, { success: true }).catch((err) => {
        console.error("Failed to record AI connection usage", err);
      });
      return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (err: any) {
      if (!(err instanceof AiServiceError)) {
        console.error("Unexpected error generating AI summary", err);
        return NextResponse.json({ error: "Something went wrong generating a summary." }, { status: 500 });
      }
      console.error("AI summary provider failed", {
        provider: connection.provider,
        code: err.code,
        message: err.message,
      });
      lastError = err;
      if (!fallbackCodes.has(err.code)) {
        return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
      }
      if (err.code === "auth" || err.code === "rate_limit") {
        await recordConnectionFailure(uid, connection.id, err.code).catch((recordError) => {
          console.error("Failed to record AI connection failure", recordError);
        });
      }
    }
  }
}
