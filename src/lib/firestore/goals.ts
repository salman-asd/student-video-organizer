import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Goal } from "@/types";

const goalsCol = (uid: string) => collection(db, "users", uid, "goals");

export async function listGoals(uid: string): Promise<Goal[]> {
  const q = query(goalsCol(uid), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Goal);
}

export async function addGoal(uid: string, title: string, targetDate?: string) {
  await addDoc(goalsCol(uid), { title, targetDate: targetDate || null, completed: false, createdAt: serverTimestamp() });
}

export async function toggleGoal(uid: string, goalId: string, completed: boolean) {
  await updateDoc(doc(db, "users", uid, "goals", goalId), { completed });
}

export async function removeGoal(uid: string, goalId: string) {
  await deleteDoc(doc(db, "users", uid, "goals", goalId));
}
