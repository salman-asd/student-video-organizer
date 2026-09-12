import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createCategory } from "@/lib/firestore/categoriesTags";
import type { CategorySuggestion, CategorySuggestionStatus } from "@/types";

export async function listCategorySuggestions(status?: CategorySuggestionStatus): Promise<CategorySuggestion[]> {
  const col = collection(db, "categorySuggestions");
  const ref = status ? query(col, where("status", "==", status)) : col;
  const snap = await getDocs(ref);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as CategorySuggestion));
}

export async function createCategorySuggestion(input: {
  suggestedName: string;
  suggestedBy: string;
  aiCleanedName?: string | null;
  similarExistingCategoryId?: string | null;
  status?: CategorySuggestionStatus;
}): Promise<string> {
  const suggestedName = input.suggestedName.trim();
  if (!suggestedName) throw new Error("Suggested category name is required.");

  const ref = await addDoc(collection(db, "categorySuggestions"), {
    suggestedName,
    suggestedBy: input.suggestedBy,
    aiCleanedName: input.aiCleanedName?.trim() || suggestedName,
    similarExistingCategoryId: input.similarExistingCategoryId ?? null,
    status: input.status ?? "pending",
    createdAt: serverTimestamp(),
  });

  return ref.id;
}

export async function updateCategorySuggestionStatus(id: string, status: CategorySuggestionStatus) {
  await updateDoc(doc(db, "categorySuggestions", id), {
    status,
    reviewedAt: serverTimestamp(),
  });
}

export async function approveCategorySuggestion(id: string, adminUid: string) {
  const snap = await getDoc(doc(db, "categorySuggestions", id));
  if (!snap.exists()) throw new Error("Category suggestion not found.");

  const suggestion = snap.data() as Partial<CategorySuggestion>;
  const chosenName = (suggestion.aiCleanedName || suggestion.suggestedName || "").trim();
  if (!chosenName) throw new Error("Category suggestion has no usable name.");

  await createCategory(chosenName, adminUid);
  await updateCategorySuggestionStatus(id, "approved");
}

export async function rejectCategorySuggestion(id: string) {
  await updateCategorySuggestionStatus(id, "rejected");
}
