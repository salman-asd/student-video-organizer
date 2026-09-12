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
      "Programming Languages",
      "Software Engineering",
      "Game Development",
    ],
  },
  {
    id: "business",
    name: "Business",
    subcategories: [
      "Finance",
      "Entrepreneurship",
      "Management",
      "Communications",
    ],
  },
  {
    id: "it-software",
    name: "IT & Software",
    subcategories: [
      "Network Security",
      "IT Certifications",
      "Hardware",
    ],
  },
  {
    id: "office-productivity",
    name: "Office Productivity",
    subcategories: [
      "Microsoft",
      "Apple",
      "Google",
      "Salesforce",
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
    ],
  },
  {
    id: "design",
    name: "Design",
    subcategories: [
      "Graphic Design",
      "UX/UI",
      "Web Design",
      "Design Tools",
    ],
  },
  {
    id: "marketing",
    name: "Marketing",
    subcategories: [
      "Social Media Marketing",
      "SEO",
      "Branding",
    ],
  },
  {
    id: "lifestyle",
    name: "Lifestyle",
    subcategories: [
      "Photography",
      "Gaming",
      "Arts & Crafts",
    ],
  },
  {
    id: "photography-video",
    name: "Photography & Video",
    subcategories: [
      "Digital Photography",
      "Video Production",
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
