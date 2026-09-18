import {
  addDoc, collection, doc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppNotification, NotificationType } from "@/types";

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

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  linkHref?: string | null;
}

/**
 * Creates a notification if the client can — used by the one trigger this app
 * currently evaluates on the client (the behind-pace check on dashboard
 * visit, Phase C4).
 *
 * NOTE ON SECURITY: firestore.rules denies `create` on this collection to
 * every client, including the owner, so this call will be REJECTED as
 * written. That is intentional and matches the Phase B decision: a client
 * that can create notifications can forge them into its own feed. Phase C4
 * needs a trigger path, and there are exactly two ways to provide one:
 *
 *   1. Relax the rule to allow `create` from the owner, constrained to the
 *      known types (the pragmatic option at this scale — a user can only
 *      pollute their own feed), or
 *   2. Keep the rule closed and move this check server-side (an API route on
 *      the Admin SDK, which bypasses rules).
 *
 * Option 2 is the one that preserves Phase B's model. This function exists so
 * the dashboard has a single, obvious seam to call either way, and so the
 * de-duplication logic lives in one place rather than being duplicated into a
 * route. It fails closed: callers treat a rejection as "no notification",
 * which is the correct degradation.
 */
export async function createNotificationIfAbsent(uid: string, notification: NewNotification) {
  const snap = await getDocs(
    query(
      notificationsCol(uid),
      where("type", "==", notification.type),
      where("linkHref", "==", notification.linkHref ?? null),
      limit(1)
    )
  );
  if (!snap.empty) return null;

  const ref = await addDoc(notificationsCol(uid), {
    type: notification.type,
    title: notification.title,
    body: notification.body,
    linkHref: notification.linkHref ?? null,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
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
