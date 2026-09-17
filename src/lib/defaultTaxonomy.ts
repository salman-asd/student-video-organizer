export interface DefaultTaxonomyCategory {
  id: string;
  name: string;
  subcategories: string[];
}

export const DEFAULT_TAXONOMY: DefaultTaxonomyCategory[] = [
  {
    id: "development",
    name: "Development",
    subcategories: [
      "Web Development",
      "Data Science",
      "Mobile Apps",
      "Programming Languages",
      "Software Engineering",
      "Game Development",
      "JavaScript",
      "TypeScript",
      "Node.js",
      "Python",
      "React",
      "Vue.js",
      "Angular",
      "C#",
      "Java",
      "C++",
    ],
  },
  {
    id: "business",
    name: "Business",
    subcategories: [
      "Entrepreneurship",
      "Management",
      "Strategy",
      "Sales",
      "Operations",
    ],
  },
  {
    id: "finance-accounting",
    name: "Finance & Accounting",
    subcategories: [
      "Accounting",
      "Bookkeeping",
      "Financial Modeling",
      "Corporate Finance",
    ],
  },
  {
    id: "it-software",
    name: "IT & Software",
    subcategories: [
      "Network Security",
      "Operating Systems",
      "IT Certifications",
      "Hardware",
    ],
  },
  {
    id: "office-productivity",
    name: "Office Productivity",
    subcategories: [
      "Microsoft Office",
      "Excel",
      "PowerPoint",
      "Word",
      "Google Workspace",
    ],
  },
  {
    id: "personal-development",
    name: "Personal Development",
    subcategories: [
      "Productivity",
      "Leadership",
      "Conversation Skills",
      "Personal Transformation",
      "Career Growth",
      "Mental Health",
    ],
  },
  {
    id: "design",
    name: "Design",
    subcategories: [
      "Graphic Design",
      "UX/UI",
      "Web Design",
      "3D Modeling",
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    subcategories: [
      "Social Media Marketing",
      "SEO",
      "Digital Marketing",
      "Advertising",
    ],
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    subcategories: [
      "Photography",
      "Gaming",
      "Arts & Crafts",
      "Food & Beverage",
      "Pet Care",
      "Travel",
    ],
  },
  {
    id: "photography-video",
    name: "Photography & Video",
    subcategories: [
      "Digital Photography",
      "Video Production",
      "Video Design",
      "Commercial Photography",
    ],
  },
  {
    id: "health-fitness",
    name: "Health & Fitness",
    subcategories: [
      "Yoga",
      "Nutrition",
      "Mental Health",
    ],
  },
  {
    id: "music",
    name: "Music",
    subcategories: ["Instruments", "Music Production", "Vocals"],
  },
  {
    id: "teaching-academics",
    name: "Teaching & Academics",
    subcategories: ["Math", "Science", "Social Sciences", "Humanities", "Test Prep"],
  },
];

export function getDefaultMainCategories(): DefaultTaxonomyCategory[] {
  return DEFAULT_TAXONOMY;
}

export function findDefaultTaxonomyCategory(mainCategoryName: string): DefaultTaxonomyCategory | null {
  const cleanName = String(mainCategoryName ?? "").trim();
  if (!cleanName) return null;

  const inputName = cleanName.toLowerCase();

  const exactMatch = DEFAULT_TAXONOMY.find((category) => category.name.trim().toLowerCase() === inputName);
  if (exactMatch) {
    return { ...exactMatch, subcategories: [...exactMatch.subcategories] };
  }

  const slugMatch = DEFAULT_TAXONOMY.find((category) => category.id.trim().toLowerCase() === inputName.replace(/\s+/g, "-"));
  if (slugMatch) {
    return { ...slugMatch, subcategories: [...slugMatch.subcategories] };
  }

  const match = DEFAULT_TAXONOMY.find((category) => {
    const categoryName = category.name.trim().toLowerCase();
    return categoryName.includes(inputName) || inputName.includes(categoryName);
  });

  return match ? { ...match, subcategories: [...match.subcategories] } : null;
}

export function getDefaultSubcategoriesForMain(mainCategoryName: string): string[] {
  const item = findDefaultTaxonomyCategory(mainCategoryName);
  return item ? [...item.subcategories] : [];
}

export function normalizeCustomInterestName(rawValue: string): string {
  const value = String(rawValue ?? "").trim();
  if (!value) return "";

  const words = value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  return words.join(" ");
}

export function validateCustomInterestName(rawValue: string): { valid: boolean; reason?: string; normalized: string } {
  const normalized = normalizeCustomInterestName(rawValue);

  if (!normalized) {
    return { valid: false, reason: "Topic name is required.", normalized: "" };
  }

  if (normalized.length < 2) {
    return { valid: false, reason: "Topic name is too short.", normalized };
  }

  if (/[^a-zA-Z0-9\s&/.-]/.test(normalized)) {
    return { valid: false, reason: "Topic name contains unsupported characters.", normalized };
  }

  return { valid: true, normalized };
}

export function validateCustomSubtopicName(
  rawValue: string,
  knownSubtopics: string[],
): { valid: boolean; reason?: string; normalized: string; suggested?: string } {
  const validation = validateCustomInterestName(rawValue);
  if (!validation.valid) return validation;

  const normalizedInput = validation.normalized.toLowerCase();
  const duplicate = knownSubtopics.find((topic) => topic.trim().toLowerCase() === normalizedInput);
  if (duplicate) {
    return {
      valid: false,
      reason: `Select “${duplicate}” from the suggested subtopics instead.`,
      normalized: validation.normalized,
      suggested: duplicate,
    };
  }

  const likelyTypo = knownSubtopics
    .map((topic) => ({ topic, score: similarityScore(normalizedInput, topic.trim().toLowerCase()) }))
    .filter((entry) => entry.score >= 0.72)
    .sort((a, b) => b.score - a.score)[0];

  if (likelyTypo) {
    return {
      valid: false,
      reason: `Did you mean “${likelyTypo.topic}”? Select the suggested spelling instead.`,
      normalized: validation.normalized,
      suggested: likelyTypo.topic,
    };
  }

  return { valid: true, normalized: validation.normalized };
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[a.length][b.length];
}
