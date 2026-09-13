export interface CategoryMasteryResult {
  categoryId: string;
  categoryName: string;
  mastery: number;
  attempts: number;
}

export interface CategoryMasteryAttemptLike {
  categoryId?: string | null;
  score: number;
  totalQuestions: number;
  completedAt?: string | Date | { toDate(): Date } | null;
}

function toDateValue(value: CategoryMasteryAttemptLike["completedAt"], fallback: Date): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return fallback;
}

export function computeCategoryMastery(
  attempts: CategoryMasteryAttemptLike[],
  categoryId: string,
  now: Date = new Date()
): number {
  const validAttempts = attempts.filter((attempt) => {
    if (attempt.categoryId !== categoryId) return false;
    const total = Number(attempt.totalQuestions || 0);
    const score = Number(attempt.score || 0);
    return Number.isFinite(total) && total > 0 && Number.isFinite(score);
  });

  if (validAttempts.length === 0) return 0;

  const weighted = validAttempts.reduce((sum, attempt) => {
    const ratio = Math.min(1, Math.max(0, (attempt.score ?? 0) / (attempt.totalQuestions || 1)));
    const completedAt = toDateValue(attempt.completedAt, now);
    const ageMs = Math.max(0, now.getTime() - completedAt.getTime());
    const daysOld = ageMs / 86400000;
    const recencyWeight = 1 + Math.max(0, 1 - daysOld / 90) * 2;
    return sum + ratio * recencyWeight;
  }, 0);

  const totalWeight = validAttempts.reduce((sum, attempt) => {
    const completedAt = toDateValue(attempt.completedAt, now);
    const ageMs = Math.max(0, now.getTime() - completedAt.getTime());
    const daysOld = ageMs / 86400000;
    const recencyWeight = 1 + Math.max(0, 1 - daysOld / 90) * 2;
    return sum + recencyWeight;
  }, 0);

  if (totalWeight === 0) return 0;
  return Math.max(0, Math.min(1, weighted / totalWeight));
}

export function getTopCategoryMastery(
  attempts: CategoryMasteryAttemptLike[],
  categories: Array<{ id: string; name: string }>,
  now: Date = new Date(),
  limit = 3
): CategoryMasteryResult[] {
  const rows = categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      attempts: attempts.filter((attempt) => attempt.categoryId === category.id).length,
      mastery: computeCategoryMastery(attempts, category.id, now),
    }))
    .filter((row) => row.attempts > 0)
    .sort((a, b) => b.mastery - a.mastery || b.attempts - a.attempts)
    .slice(0, limit);

  return rows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    mastery: row.mastery,
    attempts: row.attempts,
  }));
}
