import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_TAXONOMY } from "@/lib/defaultTaxonomy";
import type { Category, Tag } from "@/types";

const categoriesCol = (userId: string) => collection(db, "users", userId, "categories");

export async function listCategories(userId: string): Promise<Category[]> {
  const snap = await getDocs(categoriesCol(userId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdBy: userId }) as Category);
}

export async function getCategory(userId: string, id: string): Promise<Category | null> {
  const snap = await getDoc(doc(db, "users", userId, "categories", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data(), createdBy: userId } as Category) : null;
}

export async function createCategory(name: string, createdBy: string): Promise<string> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Category name is required.");
  const nameLower = cleanName.toLowerCase();
  const existing = await getDocs(query(categoriesCol(createdBy), where("nameLower", "==", nameLower)));
  if (!existing.empty) return existing.docs[0].id;
  const legacy = await getDocs(categoriesCol(createdBy));
  const match = legacy.docs.find((item) => String(item.data().name || "").trim().toLowerCase() === nameLower);
  if (match) return match.id;
  const ref = await addDoc(categoriesCol(createdBy), { name: cleanName, nameLower, createdBy });
  return ref.id;
}

export const createCategoryIfMissing = createCategory;

export async function seedDefaultCategoriesForUser(userId: string): Promise<string[]> {
  const createdIds: string[] = [];

  for (const category of DEFAULT_TAXONOMY) {
    const categoryId = await createCategory(category.name, userId);
    createdIds.push(categoryId);
  }

  return createdIds;
}

export async function ensureUserHasDefaultCategories(userId: string): Promise<string[]> {
  const existing = await listCategories(userId);
  if (existing.length > 0) return existing.map((item) => item.id);
  return seedDefaultCategoriesForUser(userId);
}

export async function updateCategory(userId: string, id: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Category name is required.");
  const nameLower = cleanName.toLowerCase();
  const existing = await getDocs(query(categoriesCol(userId), where("nameLower", "==", nameLower)));
  if (existing.docs.some((item) => item.id !== id)) throw new Error("That category already exists.");
  await updateDoc(doc(db, "users", userId, "categories", id), { name: cleanName, nameLower });
}

export async function deleteCategory(userId: string, id: string) {
  await deleteDoc(doc(db, "users", userId, "categories", id));
}

export async function listTags(): Promise<Tag[]> {
  const snap = await getDocs(collection(db, "tags"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Tag);
}

export async function createTag(name: string, createdBy: string): Promise<string> {
  const cleanName = name.trim();
  const ref = await addDoc(collection(db, "tags"), { name: cleanName, nameLower: cleanName.toLowerCase(), createdBy });
  return ref.id;
}

export async function createTagIfMissing(name: string, createdBy: string): Promise<string> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Tag name is required.");
  const nameLower = cleanName.toLowerCase();
  const existing = await getDocs(query(collection(db, "tags"), where("nameLower", "==", nameLower)));
  if (!existing.empty) return existing.docs[0].id;
  const legacy = await getDocs(collection(db, "tags"));
  const match = legacy.docs.find((item) => String(item.data().name || "").trim().toLowerCase() === nameLower);
  return match?.id || createTag(cleanName, createdBy);
}

export async function deleteTag(id: string) {
  await deleteDoc(doc(db, "tags", id));
}

export async function updateTag(id: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Tag name is required.");
  const nameLower = cleanName.toLowerCase();
  const existing = await getDocs(query(collection(db, "tags"), where("nameLower", "==", nameLower)));
  if (existing.docs.some((item) => item.id !== id)) throw new Error("That tag already exists.");
  await updateDoc(doc(db, "tags", id), { name: cleanName, nameLower });
}
