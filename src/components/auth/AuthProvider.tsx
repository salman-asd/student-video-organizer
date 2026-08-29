"use client";

import * as React from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { UserProfile } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

const SEED_ADMIN_EMAILS = (process.env.NEXT_PUBLIC_SEED_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [profile, setProfile] = React.useState<UserProfile | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted) return;

      setUser(fbUser);

      if (!fbUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);

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
          };

          await setDoc(ref, newProfile);
          if (isMounted) setProfile({ uid: fbUser.uid, ...newProfile });
        } else {
          const data = snap.data() as Omit<UserProfile, "uid">;
          const nextProfile: UserProfile = { uid: fbUser.uid, ...data };

          if (isMounted) setProfile(nextProfile);

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
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const logout = React.useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const resetPassword = React.useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const register = React.useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
  }, []);

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === "admin",
    login,
    logout,
    resetPassword,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
