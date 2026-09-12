import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { generateVideoSummary, AiServiceError, type AiErrorCode } from "@/lib/ai/aiService";
import { getYouTubeTranscript, TranscriptUnavailableError } from "@/lib/ai/transcript";
import { getAiPreferences } from "@/lib/server/aiPreferences";
import { withAiConnection } from "@/lib/server/resolveAiConnection";

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

  try {
    const title = typeof b.title === "string" ? b.title : undefined;
    const description = b.description === null ? null : typeof b.description === "string" ? b.description : undefined;

    const summary = await withAiConnection(uid, async (apiKey, provider, model) => {
      return await generateVideoSummary(
        { provider, apiKey, model },
        { title, description, transcript }
      );
    });

    return NextResponse.json({ summary }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    }
    console.error("Unexpected error generating AI summary", err);
    return NextResponse.json({ error: "Something went wrong generating a summary." }, { status: 500 });
  }
}
