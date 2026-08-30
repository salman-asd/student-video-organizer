import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Goal, PriorityLevel } from "@/types";

const goalsCol = (uid: string) => collection(db, "users", uid, "goals");

export async function listGoals(uid: string): Promise<Goal[]> {
  const q = query(goalsCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
}

export interface GoalInput {
  title: string;
  notes?: string;
  /** ISO date string ("YYYY-MM-DD") or null/undefined to leave it unset. */
  targetDate?: string | null;
  priority?: PriorityLevel;
  linkedPlaylistId?: string | null;
  linkedPlaylistTitle?: string | null;
}

export async function addGoal(uid: string, input: GoalInput) {
  await addDoc(goalsCol(uid), {
    title: input.title,
    notes: input.notes || "",
    targetDate: input.targetDate || null,
    priority: input.priority || null,
    linkedPlaylistId: input.linkedPlaylistId || null,
    linkedPlaylistTitle: input.linkedPlaylistTitle || null,
    completed: false,
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Edits an existing goal's fields (title, notes, due date, priority, or
 *  linked playlist) without touching its completed state. */
export async function updateGoal(uid: string, goalId: string, patch: Partial<GoalInput>) {
  await updateDoc(doc(db, "users", uid, "goals", goalId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function toggleGoal(uid: string, goalId: string, completed: boolean) {
  await updateDoc(doc(db, "users", uid, "goals", goalId), {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  });
}

export async function removeGoal(uid: string, goalId: string) {
  await deleteDoc(doc(db, "users", uid, "goals", goalId));
}
