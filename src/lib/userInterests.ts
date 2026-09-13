export type UserInterestLevel = "basic" | "intermediate" | "advanced" | null;

export interface UserInterest {
  categoryId: string;
  level: UserInterestLevel;
}

export interface InterestSuggestionResult {
  cleanedName: string;
  matchingCategoryId: string | null;
  matchingCategoryName: string | null;
  isDuplicate: boolean;
}

export function normalizeUserInterests(input: Array<Partial<UserInterest> | null | undefined>): UserInterest[] {
  const seen = new Set<string>();
  const next: UserInterest[] = [];

  for (const item of input ?? []) {
    if (!item) continue;
    const categoryId = String(item.categoryId ?? "").trim();
    if (!categoryId || seen.has(categoryId)) continue;
    seen.add(categoryId);
    next.push({
      categoryId,
      level: item.level === "basic" || item.level === "intermediate" || item.level === "advanced" ? item.level : null,
    });
  }

  return next;
}

export function buildInterestSuggestion(
  typedValue: string,
  categories: Array<{ id: string; name: string }>
): InterestSuggestionResult {
  const rawName = String(typedValue ?? "").trim();
  const normalizedInput = rawName.toLowerCase();

  const exactMatch = categories.find((category) => category.name.trim().toLowerCase() === normalizedInput);
  if (exactMatch) {
    return {
      cleanedName: exactMatch.name.trim(),
      matchingCategoryId: exactMatch.id,
      matchingCategoryName: exactMatch.name.trim(),
      isDuplicate: true,
    };
  }

  const closestMatch = categories
    .map((category) => ({
      category,
      score: similarityScore(normalizedInput, category.name.trim().toLowerCase()),
    }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score)[0];

  if (closestMatch) {
    return {
      cleanedName: closestMatch.category.name.trim(),
      matchingCategoryId: closestMatch.category.id,
      matchingCategoryName: closestMatch.category.name.trim(),
      isDuplicate: true,
    };
  }

  return {
    cleanedName: rawName || "",
    matchingCategoryId: null,
    matchingCategoryName: null,
    isDuplicate: false,
  };
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

function levenshteinDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

export function setUserInterestLevel(
  input: Array<Partial<UserInterest> | null | undefined>,
  categoryId: string,
  level: UserInterestLevel,
): UserInterest[] {
  const cleanCategoryId = String(categoryId ?? "").trim();
  if (!cleanCategoryId) return normalizeUserInterests(input);

  const next = normalizeUserInterests(input).map((interest) => {
    if (interest.categoryId !== cleanCategoryId) return interest;
    return { ...interest, level };
  });

  if (next.some((interest) => interest.categoryId === cleanCategoryId)) {
    return normalizeUserInterests(next);
  }

  return normalizeUserInterests([...next, { categoryId: cleanCategoryId, level }]);
}

export function hasCompletedInterestSelection(profileLike: { interests?: Array<Partial<UserInterest> | null | undefined> | null } | null | undefined): boolean {
  const interests = normalizeUserInterests(profileLike?.interests ?? []);
  return interests.length > 0;
}
