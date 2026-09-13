import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { QuizAttempt } from "@/types";

export async function listQuizAttempts(uid: string): Promise<QuizAttempt[]> {
  const q = query(collection(db, "users", uid, "quizAttempts"), orderBy("completedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as QuizAttempt));
}
