import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";
import { generateVideoQuiz, AiServiceError, type AiErrorCode } from "@/lib/ai/aiService";
import { getYouTubeTranscript, TranscriptUnavailableError } from "@/lib/ai/transcript";
import { getAiPreferences } from "@/lib/server/aiPreferences";
import { withAiConnection } from "@/lib/server/resolveAiConnection";
import { buildVideoSourceHash, getPersonalVideoQuiz, getVideoQuiz, savePersonalVideoQuiz, saveVideoQuiz } from "@/lib/firestore/quiz";

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
  if (typeof b.youtubeVideoId !== "string" || !b.youtubeVideoId.trim()) {
    return NextResponse.json({ error: "A YouTube video ID is required." }, { status: 400 });
  }

  const videoId = typeof b.videoId === "string" ? b.videoId.trim() : undefined;
  const playlistId = typeof b.playlistId === "string" ? b.playlistId.trim() : undefined;
  const ownerId = typeof b.ownerId === "string" ? b.ownerId.trim() : undefined;
  const title = typeof b.title === "string" ? b.title : undefined;
  const description = typeof b.description === "string" ? b.description : null;
  const sourceHash = buildVideoSourceHash(title || "", description);

  let cachedQuiz;
  if (ownerId && playlistId && videoId) {
    cachedQuiz = await getPersonalVideoQuiz(ownerId, playlistId, videoId).catch(() => null);
  } else if (videoId) {
    cachedQuiz = await getVideoQuiz(videoId).catch(() => null);
  }

  if (cachedQuiz && cachedQuiz.sourceHash === sourceHash) {
    return NextResponse.json({ questions: cachedQuiz.questions }, { headers: { "Cache-Control": "private, no-store" } });
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
    const questions = await withAiConnection(uid, async (apiKey, provider, model) => {
      return await generateVideoQuiz(
        { provider, apiKey, model },
        { title, description, transcript }
      );
    });

    if (ownerId && playlistId && videoId) {
      await savePersonalVideoQuiz(ownerId, playlistId, videoId, questions, sourceHash);
    } else if (videoId) {
      await saveVideoQuiz(videoId, questions, sourceHash, playlistId);
    }

    return NextResponse.json({ questions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err: any) {
    if (err instanceof AiServiceError) {
      return NextResponse.json({ error: err.message }, { status: STATUS_BY_CODE[err.code] });
    }
    console.error("Unexpected error generating AI quiz", err);
    return NextResponse.json({ error: "Something went wrong generating a quiz." }, { status: 500 });
  }
}
