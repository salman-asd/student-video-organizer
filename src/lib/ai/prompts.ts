import type { VideoSummaryInput } from "./types";

// Provider-independent: this text is identical no matter which adapter ends
// up sending it. Adapters (src/lib/ai/providers/*) only know how to deliver
// a prompt string to their provider and parse a plain-text answer back —
// they never see VideoSummaryInput or know why the prompt looks this way.
export function buildStarterSummaryPrompt(video: VideoSummaryInput): string {
  return [
    "You are helping a student understand an educational video.",
    "Using only the transcript below, write a concise summary, then list the main key points and topics.",
    "Use these exact sections: Summary, Key points, Topics.",
    "Do not invent facts, numbers, names, quotes, or claims that are not supported by the transcript.",
    "",
    "Transcript:",
    video.transcript,
  ].join("\n");
}
