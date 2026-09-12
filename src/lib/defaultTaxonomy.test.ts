import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findDefaultTaxonomyCategory, getDefaultMainCategories, getDefaultSubcategoriesForMain } from "./defaultTaxonomy";

describe("default taxonomy", () => {
  it("includes the required default main categories", () => {
    const names = getDefaultMainCategories().map((item) => item.name);

    assert.ok(names.includes("Development"));
    assert.ok(names.includes("Business"));
    assert.ok(names.includes("IT & Software"));
    assert.ok(names.includes("Office Productivity"));
    assert.ok(names.includes("Personal Development"));
    assert.ok(names.includes("Design"));
    assert.ok(names.includes("Marketing"));
    assert.ok(names.includes("Lifestyle"));
    assert.ok(names.includes("Photography & Video"));
    assert.ok(names.includes("Health & Fitness"));
  });

  it("includes a specific subtopic for Personal Development", () => {
    const subtopics = getDefaultSubcategoriesForMain("Personal Development");

    assert.ok(subtopics.includes("Conversation Skills"));
    assert.ok(subtopics.includes("Leadership"));
    assert.ok(subtopics.includes("Productivity"));
  });

  it("resolves a default category by name for the subtopic onboarding flow", () => {
    const category = findDefaultTaxonomyCategory("development");

    assert.ok(category);
    assert.equal(category?.name, "Development");
    assert.ok(category?.subcategories.includes("Web Development"));
  });
});
