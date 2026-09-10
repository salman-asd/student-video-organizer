import type { NextRequest } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";

/**
 * Verifies the "Authorization: Bearer <idToken>" header against Firebase
 * Admin Auth and returns the caller's uid, or null if missing/invalid.
 *
 * Same check every existing authenticated route already does inline (see
 * src/app/api/youtube-duration/route.ts and src/app/api/find-user/route.ts)
 * — factored out here since Phase 2 adds several new route files that all
 * need it. Existing routes are left untouched; this doesn't change them.
 */
export async function requireAuthenticatedUid(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}
