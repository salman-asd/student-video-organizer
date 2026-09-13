import { addDoc, collection } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { requireAuthenticatedUid } from "@/lib/server/requireAuth";

export async function POST(req: NextRequest) {
  const uid = await requireAuthenticatedUid(req);
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;
  const videoId = typeof record.videoId === "string" ? record.videoId.trim() : "";
  const totalQuestions = Number(record.totalQuestions ?? 0);
  const score = Number(record.score ?? 0);

  if (!videoId || !Number.isFinite(totalQuestions) || totalQuestions <= 0 || !Number.isFinite(score)) {
    return NextResponse.json({ error: "A valid quiz result is required." }, { status: 400 });
  }

  try {
    const ref = await addDoc(collection(db, "users", uid, "quizAttempts"), {
      userId: uid,
      videoId,
      categoryId: typeof record.categoryId === "string" ? record.categoryId : null,
      score,
      totalQuestions,
      completedAt: new Date(),
    });

    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("Failed to save quiz attempt", error);
    return NextResponse.json({ error: "Failed to save quiz attempt." }, { status: 500 });
  }
}
