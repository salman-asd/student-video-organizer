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

export function buildQuizPrompt(video: QuizVideoInput): string {
  return [
    "You are generating a short comprehension quiz for a learning video.",
    "Using only the information available in the transcript and title/description below, create exactly 5 multiple-choice questions.",
    "Return valid JSON only. The root must be an array of objects with this exact shape:",
    "[{\"id\":\"q1\",\"prompt\":\"question text\",\"options\":[{\"id\":\"a\",\"text\":\"option text\"},{\"id\":\"b\",\"text\":\"option text\"}],\"correctOptionId\":\"a\",\"explanation\":\"why the answer is correct\"}]",
    "Rules:",
    "- Do not invent facts, names, dates, or claims that are not grounded in the content.",
    "- Use 4 options per question, labeled a, b, c, d.",
    "- Each question should test a clear learning objective from the material.",
    "- Include a brief explanation for the correct answer.",
    "- Ensure the JSON array contains only plain text values with no markdown fences.",
    "",
    "Title:",
    video.title || "(no title)",
    "",
    "Description:",
    video.description || "(no description)",
    "",
    "Transcript:",
    video.transcript,
  ].join("\n");
}
