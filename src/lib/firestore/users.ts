import { collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Role, UserProfile, UserStatsSnapshot, UserVideoState } from "@/types";
import { todayKey } from "@/lib/utils";

export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserProfile);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null;
}

export async function setUserRole(uid: string, role: Role) {
  await updateDoc(doc(db, "users", uid), { role });
}

export async function setUserStatus(uid: string, status: "active" | "disabled") {
  await updateDoc(doc(db, "users", uid), { status });
}

/**
 * Computes a stats snapshot for a single student from their (small) personal
 * videoStates collection, then writes it onto users/{uid}.stats so the admin
 * table can render every student's row from ONE read (the users collection)
 * instead of fanning out into every student's subcollections on every page
 * load. Call this on meaningful events (video completed, admin dashboard
 * "refresh") rather than continuously.
 */
export async function recomputeUserStats(uid: string): Promise<UserStatsSnapshot> {
  const snap = await getDocs(collection(db, "users", uid, "videoStates"));
  const states = snap.docs.map((d) => d.data() as UserVideoState);

  let completed = 0, inProgress = 0, favorites = 0, watchLater = 0, priority = 0, totalWatchTimeSeconds = 0;
  const watchedDates = new Set<string>();

  for (const s of states) {
    if (s.status === "completed") completed++;
    else if (s.status === "in_progress") inProgress++;
    if (s.isFavorite) favorites++;
    if (s.isWatchLater) watchLater++;
    if (s.priority) priority++;
    // Rough watch-time estimate: percentage watched as a fraction of a nominal
    // slot isn't available without duration here, so this is refined at the
    // video level (see stats.ts) when durations are known; kept simple for MVP.
    if (s.lastWatchedAt && typeof (s.lastWatchedAt as any).toDate === "function") {
      watchedDates.add((s.lastWatchedAt as any).toDate().toISOString().slice(0, 10));
    }
  }

  const currentStreakDays = computeStreak(watchedDates);

  const statsSnapshot: UserStatsSnapshot = {
    totalVideos: states.length,
    completed,
    inProgress,
    notStarted: Math.max(0, states.length - completed - inProgress),
    favorites,
    watchLater,
    priority,
    totalWatchTimeSeconds,
    currentStreakDays,
    lastStreakDate: todayKey(),
    updatedAt: serverTimestamp() as any,
  };

  await updateDoc(doc(db, "users", uid), { stats: statsSnapshot });
  return statsSnapshot;
}

function computeStreak(watchedDates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  // Walk backwards from today while consecutive days have activity.
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (watchedDates.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
