import { fetchTranscript } from "youtube-transcript";

const MAX_TRANSCRIPT_CHARS = 60_000;

export class TranscriptUnavailableError extends Error {
  constructor(message = "No YouTube transcript is available for this video.") {
    super(message);
    this.name = "TranscriptUnavailableError";
  }
}

export function cleanTranscript(text: string): string {
  return text
    .replace(/\[music\]|\[applause\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getYouTubeTranscript(videoId: string): Promise<string> {
  try {
    const entries = await fetchTranscript(videoId);
    const transcript = cleanTranscript(entries.map((entry) => entry.text || "").join(" "));
    if (!transcript) throw new TranscriptUnavailableError();
    return transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  } catch (error) {
    if (error instanceof TranscriptUnavailableError) throw error;
    throw new TranscriptUnavailableError();
  }
}
