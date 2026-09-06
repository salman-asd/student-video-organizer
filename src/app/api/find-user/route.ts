import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/server/firebase-admin";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    return NextResponse.json({ error: "Recipient lookup is not configured on the server." }, { status: 503 });
  }

  try {
    const caller = await adminAuth.verifyIdToken(authorization.slice(7));
    const email = new URL(request.url).searchParams.get("email")?.trim();
    if (!email || email.length > 320) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    const profile = await adminAuth.getUserByEmail(email);
    if (profile.uid === caller.uid) return NextResponse.json({ found: false, sameUser: true });
    return NextResponse.json({ found: true, uid: profile.uid });
  } catch (error: any) {
    if (error?.code === "auth/user-not-found") return NextResponse.json({ found: false });
    console.error("Recipient lookup failed", error);
    return NextResponse.json({ error: "Recipient lookup failed on the server." }, { status: 500 });
  }
}