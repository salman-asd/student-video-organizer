"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flame, GraduationCap, MailCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { friendlyAuthError } from "@/lib/authErrors";
import { resendCooldownRemaining } from "@/lib/emailVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Mode = "login" | "register" | "reset" | "verify";

export default function LoginPage() {
  const { user, loading, profile, needsOnboarding, login, loginWithGoogle, register, resetPassword, resendVerification } = useAuth();
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [googleSubmitting, setGoogleSubmitting] = React.useState(false);
  // Email-verification screen state.
  const [verifyNotice, setVerifyNotice] = React.useState<string | null>(null);
  const [lastSentAt, setLastSentAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const cooldownMs = resendCooldownRemaining(lastSentAt, now);

  // Tick once a second only while the resend cooldown is running.
  React.useEffect(() => {
    if (cooldownMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Landing here from the link in the verification email (?verified=1).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("verified") === "1") {
      toast.success("Email verified — you can sign in now.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  React.useEffect(() => {
    if (!loading && user) {
      router.replace(needsOnboarding || !profile ? "/onboarding" : "/dashboard");
    }
  }, [loading, user, profile, needsOnboarding, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Welcome back!");
      } else if (mode === "register") {
        const { emailSent } = await register(email, password, name || email.split("@")[0]);
        // No sign-in yet: the account is only usable after the emailed link is clicked.
        setVerifyNotice(emailSent ? null : "We created your account but couldn't send the email yet. Press Resend below.");
        if (emailSent) setLastSentAt(Date.now());
        setNow(Date.now());
        setMode("verify");
      } else if (mode === "verify") {
        // "I've verified — sign in": try a normal sign-in with what the user already typed.
        await login(email, password);
        toast.success("Welcome!");
      } else {
        await resetPassword(email);
        toast.success("Password reset email sent");
        setMode("login");
      }
    } catch (err: any) {
      if (err?.code === "auth/email-not-verified") {
        // Correct password, but the email link hasn't been clicked yet.
        setVerifyNotice(mode === "verify" ? "Not verified yet — open the link in your email first." : "Please verify your email before signing in. We sent you a link when you registered.");
        setMode("verify");
      } else {
        toast.error(friendlyAuthError(err?.code));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (cooldownMs > 0 || !email || !password) return;
    setSubmitting(true);
    try {
      const result = await resendVerification(email, password);
      if (result === "already-verified") {
        toast.success("Your email is already verified — signing you in.");
      } else {
        setLastSentAt(Date.now());
        setNow(Date.now());
        setVerifyNotice(null);
        toast.success("Verification email sent. Check your inbox (and spam).");
      }
    } catch (err: any) {
      toast.error(friendlyAuthError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  async function onGoogleClick() {
    setGoogleSubmitting(true);
    try {
      await loginWithGoogle();
      toast.success("Welcome!");
    } catch (err: any) {
      // Popup closed by the user isn't a real error — don't show a toast for it.
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        toast.error(err?.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
        <div className="flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-accent" />
          <span className="font-display text-xl font-semibold">Study Lamp</span>
        </div>
        <div className="space-y-6">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            Every lesson,
            <br /> one quiet desk.
          </h1>
          <p className="max-w-sm text-primary-foreground/75">
            Organize the videos you&apos;re learning from, pick up exactly where you left off,
            and keep notes and bookmarks next to every lesson.
          </p>
          <div className="flex gap-6 pt-4 text-sm text-primary-foreground/70">
            <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-accent" /> Track every lesson</div>
            <div className="flex items-center gap-2"><Flame className="h-4 w-4 text-accent" /> Keep your streak</div>
          </div>
        </div>
        <p className="text-xs text-primary-foreground/50">External videos only — nothing is ever uploaded here.</p>
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-sm border-none shadow-none sm:border sm:shadow-sm">
          <CardContent className="pt-6">
            <div className="mb-6 flex items-center gap-2 md:hidden">
              <BookOpen className="h-5 w-5 text-accent" />
              <span className="font-display text-lg font-semibold">Study Lamp</span>
            </div>

            <h2 className="font-display text-2xl font-semibold">
              {mode === "login" && "Welcome back"}
              {mode === "register" && "Create your account"}
              {mode === "reset" && "Reset your password"}
              {mode === "verify" && "Check your email"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" && "Sign in to continue learning."}
              {mode === "register" && "Set up your personal learning library."}
              {mode === "reset" && "We&apos;ll email you a reset link."}
              {mode === "verify" && "One more step before you can sign in."}
            </p>

            {mode !== "verify" && (
            <Button
              type="button"
              variant="outline"
              className="mt-6 w-full"
              disabled={googleSubmitting || submitting}
              onClick={onGoogleClick}
            >
              <GoogleIcon className="h-4 w-4" />
              {googleSubmitting ? "Connecting…" : "Continue with Google"}
            </Button>
            )}

            {mode === "verify" && (
              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
                  <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <div className="space-y-1">
                    <p>We sent a verification link to <strong className="break-all">{email || "your email"}</strong>.</p>
                    <p className="text-muted-foreground">Open it, then come back here and sign in. Can&apos;t find it? Check your spam folder.</p>
                  </div>
                </div>
                {verifyNotice && <p role="status" className="text-sm text-destructive">{verifyNotice}</p>}
              </div>
            )}

            {mode !== "reset" && mode !== "verify" && (
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                or
                <div className="h-px flex-1 bg-border" />
              </div>
            )}

            <form onSubmit={onSubmit} className={mode === "reset" ? "mt-6 space-y-4" : "space-y-4"}>
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              {mode !== "reset" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">{mode === "verify" ? "Your password (to sign in or resend)" : "Password"}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "verify" ? "I've verified — sign in" : "Send reset link"}
              </Button>
              {mode === "verify" && (
                <Button type="button" variant="outline" className="w-full" disabled={submitting || cooldownMs > 0 || !password} onClick={onResend}>
                  {cooldownMs > 0 ? `Resend email in ${Math.ceil(cooldownMs / 1000)}s` : "Resend verification email"}
                </Button>
              )}
            </form>

            <div className="mt-4 flex flex-col gap-1 text-center text-sm text-muted-foreground">
              {mode === "login" && (
                <>
                  <button className="hover:text-foreground" onClick={() => setMode("reset")}>Forgot your password?</button>
                  <button className="hover:text-foreground" onClick={() => setMode("register")}>New here? Create an account</button>
                </>
              )}
              {mode !== "login" && (
                <button className="hover:text-foreground" onClick={() => { setVerifyNotice(null); setMode("login"); }}>
                  {mode === "verify" ? "Use a different email" : "Back to sign in"}
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09A6.6 6.6 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}
