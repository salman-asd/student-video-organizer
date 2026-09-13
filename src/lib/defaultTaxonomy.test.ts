import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findDefaultTaxonomyCategory, getDefaultMainCategories, getDefaultSubcategoriesForMain, validateCustomSubtopicName } from "./defaultTaxonomy";

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
    assert.ok(names.includes("Finance & Accounting"));
    assert.ok(names.includes("Music"));
    assert.ok(names.includes("Teaching & Academics"));
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

  it("includes the product-plan subtopics for Finance & Accounting", () => {
    const subtopics = getDefaultSubcategoriesForMain("Finance & Accounting");

    assert.deepEqual(subtopics, ["Accounting", "Bookkeeping", "Financial Modeling", "Corporate Finance"]);
  });

  it("rejects duplicate and likely misspelled custom subtopics", () => {
    const known = ["JavaScript", "TypeScript", "Node.js"];

    assert.equal(validateCustomSubtopicName("javascript", known).valid, false);
    assert.equal(validateCustomSubtopicName("Javscript", known).suggested, "JavaScript");
    assert.equal(validateCustomSubtopicName("Rust", known).valid, true);
  });

  it("normalizes a valid custom subtopic without changing its meaning", () => {
    const result = validateCustomSubtopicName("  react native  ", ["JavaScript", "Node.js"]);

    assert.deepEqual(result, { valid: true, normalized: "React Native" });
  });
});
