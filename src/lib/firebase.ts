import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";

// Only Firebase Authentication + Cloud Firestore are used (Spark/free plan).
// No Storage, Functions, or other billing-gated services.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function createApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const app = createApp();
export const auth: Auth = getAuth(app);

// initializeFirestore (instead of getFirestore) lets us enable local cache
// with multi-tab support, which cuts down on redundant reads across tabs —
// helpful for staying comfortably within the Spark plan's free quota.
export const db: Firestore = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});
