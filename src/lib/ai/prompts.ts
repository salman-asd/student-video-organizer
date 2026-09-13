import type { GoalSuggestionInput, QuizVideoInput, VideoSummaryInput } from "./types";

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

export function buildGoalSuggestionPrompt(input: GoalSuggestionInput): string {
  const stepLines = input.steps
    .map((step, index) => `${index + 1}. ${step.title}${step.description ? ` — ${step.description}` : ""}`)
    .join("\n");

  return [
    "You are helping a student turn a learning roadmap into a few concrete goals with deadlines.",
    `Category: ${input.categoryName} (${input.level} level)`,
    "Roadmap steps:",
    stepLines,
    "",
    "Propose 2 to 4 milestone goals that group these steps into sensible checkpoints — not one goal per step.",
    "Return valid JSON only. The root must be an array of objects with this exact shape:",
    "[{\"title\":\"short goal title\",\"notes\":\"one sentence on what finishing this milestone means\",\"daysFromNow\":14}]",
    "Rules:",
    "- 2 to 4 goals total, ordered earliest deadline first.",
    "- daysFromNow is a whole number of days from today, spaced out sensibly (e.g. 7, 21, 45) so goals don't all land on the same day.",
    "- Titles should read like a student's own goal (\"Finish the fundamentals\"), not a copy of a step title.",
    "- Do not invent steps or topics that aren't implied by the roadmap above.",
    "- Ensure the JSON array contains only plain text and number values with no markdown fences.",
  ].join("\n");
}

function stripHtmlToPlainText(value?: string | null): string {
  if (!value) return "(none)";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "\n- ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || "(none)";
}

export function buildQuizPrompt(video: QuizVideoInput): string {
  const summaryText = stripHtmlToPlainText(video.summary);
  const transcriptText = (video.transcript || "").trim() || "(no transcript)";

  return [
    "You are generating a short comprehension quiz for a learning video.",
    "Use the strongest available source in this order: 1) saved summary, 2) transcript/captions, 3) title and description as secondary context only.",
    "Do not invent facts, names, dates, or claims that are not grounded in the content source. Title/description should only fill gaps when the summary/transcript are missing or incomplete.",
    "Create exactly 5 multiple-choice questions.",
    "Return valid JSON only. The root must be an array of objects with this exact shape:",
    "[{\"id\":\"q1\",\"prompt\":\"question text\",\"options\":[{\"id\":\"a\",\"text\":\"option text\"},{\"id\":\"b\",\"text\":\"option text\"}],\"correctOptionId\":\"a\",\"explanation\":\"why the answer is correct\"}]",
    "Rules:",
    "- Use 4 options per question, labeled a, b, c, d.",
    "- Each question should test a clear learning objective from the material.",
    "- Include a brief explanation for the correct answer.",
    "- Ensure the JSON array contains only plain text values with no markdown fences.",
    "",
    "Saved summary:",
    summaryText,
    "",
    "Transcript:",
    transcriptText,
    "",
    "Title:",
    video.title || "(no title)",
    "",
    "Description:",
    video.description || "(no description)",
  ].join("\n");
}
