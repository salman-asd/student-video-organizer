"use client";

import * as React from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ensureUserHasDefaultCategories } from "@/lib/firestore/categoriesTags";
import { hasCompletedOnboarding, normalizeUserInterests } from "@/lib/userInterests";
import { shouldBlockUnverified } from "@/lib/emailVerification";
import type { UserProfile } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  needsOnboarding: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Creates the account and emails a verification link. The user is NOT left signed in. */
  register: (email: string, password: string, displayName: string) => Promise<{ emailSent: boolean }>;
  /** Re-sends the verification email (signs in briefly with the credentials, then signs out). */
  resendVerification: (email: string, password: string) => Promise<"sent" | "already-verified">;
  /** True when the signed-in user's email is verified (always true for Google). */
  emailVerified: boolean;
  /** True when the account has an email+password sign-in (so "Change password" applies). */
  hasPasswordProvider: boolean;
  /** Sends a verification email to the signed-in (legacy, unverified) user. */
  sendVerificationToCurrentUser: () => Promise<void>;
  /** Re-reads the user from Firebase so a just-verified email is picked up without signing out. */
  refreshEmailVerified: () => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Records that the user finished or explicitly skipped onboarding. */
  completeOnboarding: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Thrown by login() when a NEW account hasn't confirmed its email yet. */
export class EmailNotVerifiedError extends Error {
  code = "auth/email-not-verified" as const;
  constructor() {
    super("Please verify your email before signing in.");
  }
}

/**
 * Sends the verification email. The link's "continue" target is the login page; if the deployed
 * domain hasn't been added to Firebase → Authentication → Settings → Authorized domains, Firebase
 * rejects the continue URL, so fall back to a plain email rather than failing the whole flow.
 */
async function sendVerificationEmail(user: User): Promise<void> {
  try {
    await sendEmailVerification(user, { url: `${window.location.origin}/login?verified=1` });
  } catch (error: any) {
    if (error?.code === "auth/unauthorized-continue-uri" || error?.code === "auth/invalid-continue-uri") {
      await sendEmailVerification(user);
      return;
    }
    throw error;
  }
}

const SEED_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_SEED_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  // login()/register()/resend briefly hold an unverified session. While one of those runs, the auth
  // listener must not sign the user out underneath it.
  const flowRef = React.useRef(0);
  // Bumped when user.reload() changes emailVerified in place (the User object is mutated, not replaced).
  const [, setVerifiedTick] = React.useState(0);
  // Gated on the explicit "finished or skipped" flag, not on "has interests" —
  // picking interests is optional, so a user who pressed "Skip for now" must
  // not be bounced back into the flow forever. See hasCompletedOnboarding.
  const needsOnboarding = !!profile && !hasCompletedOnboarding(profile);

  React.useEffect(() => {
    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted) return;

      if (!fbUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref).catch(() => null);

        // Email-verification gate: a NEW account (no profile yet) must confirm its email before it
        // counts as signed in. We don't create a profile, categories or any data for it, and we treat
        // it as signed out. Existing accounts with a profile are grandfathered (see emailVerification.ts).
        if (shouldBlockUnverified({ emailVerified: fbUser.emailVerified, hasProfile: !!snap?.exists() })) {
          if (isMounted) { setUser(null); setProfile(null); setLoading(false); }
          if (flowRef.current === 0) await fbSignOut(auth).catch(() => {});
          return;
        }

        setUser(fbUser);
        if (!snap) throw new Error("Could not load profile");

        if (!snap.exists()) {
          // First sign-in: create the profile document. Role is 'admin' only
          // if the email is in the seed list; otherwise 'student'. Real admin
          // promotion afterwards happens via Firestore (admin-only write).
          const role = SEED_ADMIN_EMAILS.includes((fbUser.email || "").toLowerCase()) ? "admin" : "student";
          const newProfile: Omit<UserProfile, "uid"> = {
            email: fbUser.email || "",
            displayName: fbUser.displayName || fbUser.email?.split("@")[0] || "Student",
            role,
            status: "active",
            createdAt: serverTimestamp() as any,
            lastActiveAt: serverTimestamp() as any,
            interests: [],
          };

          await setDoc(ref, newProfile);
          await ensureUserHasDefaultCategories(fbUser.uid).catch(() => {});
          if (isMounted) setProfile({ uid: fbUser.uid, ...newProfile });
        } else {
          const data = snap.data() as Omit<UserProfile, "uid">;
          const nextProfile: UserProfile = {
            uid: fbUser.uid,
            ...data,
            interests: normalizeUserInterests((data as any).interests ?? []),
          };

          if (isMounted) setProfile(nextProfile);

          await ensureUserHasDefaultCategories(fbUser.uid).catch(() => {});

          // Cheap, infrequent write — only touches lastActiveAt, not on every action.
          await updateDoc(ref, { lastActiveAt: serverTimestamp() }).catch(() => {});
        }
      } catch (error) {
        console.error("Failed to sync Firebase auth profile", error);
        if (isMounted) setProfile(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    flowRef.current++;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        const snap = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
        if (shouldBlockUnverified({ emailVerified: false, hasProfile: !!snap?.exists() })) {
          await fbSignOut(auth);
          throw new EmailNotVerifiedError();
        }
      }
    } finally {
      flowRef.current--;
    }
  }, []);

  /** Google sign-in. Reuses the exact same profile-creation path as
   *  email/password — onAuthStateChanged above fires for any auth method,
   *  so a first-time Google user gets a proper users/{uid} doc created
   *  automatically, using their Google displayName instead of asking them
   *  to type one. */
  const loginWithGoogle = React.useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      // Someone already has a password-based account under this email and
      // tried Google sign-in — give a specific, actionable message instead
      // of letting a cryptic Firebase error code reach the UI unhandled.
      if (error?.code === "auth/account-exists-with-different-credential") {
        throw new Error(
          "An account already exists with this email using a different sign-in method. Try signing in with your email and password instead."
        );
      }
      // Popup closed/blocked — let the caller decide how to surface this;
      // re-throw as-is so the login page can show its own friendly copy.
      throw error;
    }
  }, []);

  const logout = React.useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const register = React.useCallback(async (email: string, password: string, displayName: string) => {
    flowRef.current++;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      let emailSent = true;
      try {
        await updateProfile(cred.user, { displayName });
        await sendVerificationEmail(cred.user);
      } catch {
        // The account exists; only the email failed (e.g. throttled). The verify screen offers Resend.
        emailSent = false;
      }
      // Never leave a brand-new, unverified account signed in.
      await fbSignOut(auth);
      return { emailSent };
    } finally {
      flowRef.current--;
    }
  }, []);

  const resendVerification = React.useCallback(async (email: string, password: string) => {
    flowRef.current++;
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (cred.user.emailVerified) return "already-verified" as const; // stay signed in; the listener takes over
      try {
        await sendVerificationEmail(cred.user);
      } finally {
        await fbSignOut(auth);
      }
      return "sent" as const;
    } finally {
      flowRef.current--;
    }
  }, []);

  const sendVerificationToCurrentUser = React.useCallback(async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) await sendVerificationEmail(auth.currentUser);
  }, []);

  const refreshEmailVerified = React.useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return false;
    await current.reload();
    setVerifiedTick((n) => n + 1);
    return current.emailVerified;
  }, []);

  /** Re-authenticates with the current password first (Firebase requires a recent sign-in to
   *  change a password), then sets the new one. */
  const changePassword = React.useCallback(async (currentPassword: string, newPassword: string) => {
    const current = auth.currentUser;
    if (!current || !current.email) throw Object.assign(new Error("Not signed in"), { code: "auth/requires-recent-login" });
    await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
    await updatePassword(current, newPassword);
  }, []);

  /** Marks onboarding done — called both on "Continue" (interests saved) and
   *  on "Skip for now". Updated locally as well as in Firestore so the
   *  redirect decision doesn't have to wait for a profile refetch. */
  const completeOnboarding = React.useCallback(async () => {
    if (!user) return;
    const completedAt = serverTimestamp();
    await updateDoc(doc(db, "users", user.uid), { onboardingCompletedAt: completedAt });
    // hasCompletedOnboarding only asks whether the field is truthy, so any
    // non-null marker flips needsOnboarding immediately — no refetch needed.
    setProfile((prev) => (prev ? { ...prev, onboardingCompletedAt: completedAt as any } : prev));
  }, [user]);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === "admin",
    needsOnboarding,
    login,
    loginWithGoogle,
    logout,
    resetPassword,
    register,
    resendVerification,
    emailVerified: !!user?.emailVerified,
    hasPasswordProvider: !!user?.providerData.some((p) => p.providerId === "password"),
    sendVerificationToCurrentUser,
    refreshEmailVerified,
    changePassword,
    completeOnboarding,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
