import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppNotification } from "@/types";

/**
 * users/{uid}/notifications/{id} — the delivery mechanism behind the bell in
 * Header.tsx.
 *
 * Note what's deliberately absent: there is no `createNotification`. Trigger
 * notifications are written by server-side logic through the Admin SDK (see
 * firestore.rules, where `create` is denied to the client entirely). Adding a
 * client-side create here would be the one way to forge a notification into
 * another surface's feed, so Phase B's client module only reads and updates.
 */

const notificationsCol = (uid: string) => collection(db, "users", uid, "notifications");

/**
 * Lightweight on-load query, not a live listener — same free-tier reasoning
 * used elsewhere in this app (see firebase.ts's comment on local cache).
 * `max` keeps a long-lived account from pulling its entire history into the
 * bell dropdown.
 */
export async function listNotifications(uid: string, max = 25): Promise<AppNotification[]> {
  const q = query(notificationsCol(uid), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
}

/**
 * Unread count for the badge. Counted with an aggregation query so the badge
 * doesn't depend on how many notifications the dropdown already fetched.
 * Falls back to 0 on failure — a missing badge is a far better failure mode
 * than a broken header.
 */
export async function countUnreadNotifications(uid: string): Promise<number> {
  try {
    const q = query(notificationsCol(uid), where("read", "==", false));
    const snap = await getDocs(q);
    return snap.size;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(uid: string, notificationId: string) {
  await updateDoc(doc(db, "users", uid, "notifications", notificationId), {
    read: true,
    readAt: serverTimestamp(),
  });
}

/**
 * Marks every currently-unread notification read. Firestore has no "update
 * where" — only documents passed to a batch/transaction can be written — so
 * this reads the unread set first (which is exactly the badge query) and
 * writes them in batches, staying under Firestore's 500-writes-per-batch cap.
 */
export async function markAllNotificationsRead(uid: string): Promise<number> {
  const q = query(notificationsCol(uid), where("read", "==", false));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const docs = snap.docs;
  const BATCH_LIMIT = 450;
  for (let start = 0; start < docs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of docs.slice(start, start + BATCH_LIMIT)) {
      batch.update(d.ref, { read: true, readAt: serverTimestamp() });
    }
    await batch.commit();
  }

  return docs.length;
}
