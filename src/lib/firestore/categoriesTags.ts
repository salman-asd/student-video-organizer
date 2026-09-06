import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Category, Tag } from "@/types";

export async function listCategories(): Promise<Category[]> {
  const snap = await getDocs(collection(db, "categories"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Category);
}

export async function createCategory(name: string, createdBy: string): Promise<string> {
  const ref = await addDoc(collection(db, "categories"), { name, createdBy });
  return ref.id;
}

export async function deleteCategory(id: string) {
  await deleteDoc(doc(db, "categories", id));
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
