import type { QuizQuestion } from "@/types";

export interface GenerateQuizInput {
  youtubeVideoId: string;
  videoId?: string;
  playlistId?: string;
  ownerId?: string;
  title?: string;
  description?: string | null;
  summary?: string | null;
}

export async function generateVideoQuizForCurrentVideo(
  idToken: string,
  input: GenerateQuizInput,
): Promise<{ questions: QuizQuestion[] }> {
  const res = await fetch("/api/ai/quiz/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Quiz generation failed (${res.status})`);
  return { questions: Array.isArray(data.questions) ? data.questions : [] };
}
