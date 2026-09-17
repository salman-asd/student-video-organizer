export interface ReviewAttempt {
  videoId: string;
  score: number;
  totalQuestions: number;
  completedAt?: unknown;
}

export interface DueReview {
  videoId: string;
  scorePercent: number;
  ageDays: number;
}

function timestampMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getDueReviews(
  attempts: ReviewAttempt[],
  now: Date = new Date(),
): DueReview[] {
  return attempts
    .map((attempt) => {
      const total = Number(attempt.totalQuestions);
      const score = Number(attempt.score);
      const completedAt = timestampMillis(attempt.completedAt);
      if (!attempt.videoId || !Number.isFinite(total) || total <= 0 || !Number.isFinite(score) || completedAt <= 0) return null;

      const ageDays = Math.floor(Math.max(0, now.getTime() - completedAt) / 86400000);
      const scorePercent = Math.round(Math.max(0, Math.min(1, score / total)) * 100);
      const intervalDays = scorePercent < 80 ? 3 : 7;
      return ageDays >= intervalDays ? { videoId: attempt.videoId, scorePercent, ageDays } : null;
    })
    .filter((review): review is DueReview => !!review)
    .sort((a, b) => b.ageDays - a.ageDays || a.scorePercent - b.scorePercent);
}
