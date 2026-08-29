import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  } else {
    // Fail closed: server-side auth cannot safely verify user sessions without
    // a configured admin SDK environment. Routes that require admin-only access
    // should reject requests instead of silently allowing unauthenticated access.
    admin.initializeApp({ projectId: projectId || "demo-project" });
  }
}

export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
