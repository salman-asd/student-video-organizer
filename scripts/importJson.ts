/**
 * One-time CLI importer for the initial JSON dataset — an alternative to the
 * in-app Admin > Import JSON page, useful when seeding a large dataset
 * before any admin has logged in.
 *
 * Usage:
 *   1. Download a Firebase service account key (Project Settings > Service
 *      Accounts > Generate new private key) and save it as
 *      `serviceAccountKey.json` in the project root (keep it out of git).
 *   2. npm run import:json -- --file=./data/videos.json --playlist="English Therapy Level 1" --uid=<admin-uid>
 *
 * This uses firebase-admin (dev dependency you can add with
 * `npm i -D firebase-admin`) so it can write with elevated privileges,
 * bypassing security rules for a one-time seed. It does not require a paid
 * plan — the Admin SDK works on the Spark plan the same as the client SDK.
 */
import { readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function arg(name: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found?.split("=").slice(1).join("=");
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const filePath = arg("file");
  const playlistTitle = arg("playlist");
  const uid = arg("uid");
  if (!filePath || !playlistTitle || !uid) {
    console.error("Usage: npm run import:json -- --file=./data.json --playlist=\"Name\" --uid=<adminUid>");
    process.exit(1);
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(readFileSync("./serviceAccountKey.json", "utf-8"));
    initializeApp({ credential: cert(serviceAccount) });
  }
  const db = getFirestore();

  const raw = JSON.parse(readFileSync(filePath!, "utf-8"));
  const rows: any[] = Array.isArray(raw) ? raw : raw.videos || raw.items || [];

  const playlistRef = db.collection("playlists").doc();
  await playlistRef.set({
    title: playlistTitle,
    description: "",
    visibility: "shared",
    videoCount: rows.length,
    source: "json-import",
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const batchSize = 400; // stay under Firestore's 500-op batch limit
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = db.batch();
    rows.slice(i, i + batchSize).forEach((r, j) => {
      const order = i + j;
      const url = r.URL || r.url || r.videoUrl || "";
      const ytId = extractYouTubeId(url);
      const ref = playlistRef.collection("videos").doc();
      batch.set(ref, {
        title: r.Title || r.title || "Untitled",
        videoUrl: url,
        youtubeVideoId: ytId,
        thumbnailUrl: r["Thumbnail URL"] || r.thumbnailUrl || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : ""),
        videoNo: numOrNull(r["Video No"] ?? r.videoNo),
        lessonNo: numOrNull(r["Lesson No"] ?? r.lessonNo),
        partNo: numOrNull(r["Part No"] ?? r.partNo),
        pageNo: numOrNull(r["Page No"] ?? r.pageNo),
        order,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    console.log(`Imported ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
  }

  console.log(`Done. Playlist "${playlistTitle}" created with ${rows.length} videos.`);
}

function numOrNull(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
