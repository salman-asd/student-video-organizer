import { addDoc, collection, deleteDoc, doc, getDocs } from "firebase/firestore";
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
  const ref = await addDoc(collection(db, "tags"), { name, createdBy });
  return ref.id;
}

export async function deleteTag(id: string) {
  await deleteDoc(doc(db, "tags", id));
}
