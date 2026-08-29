"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Flame, GraduationCap } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

type Mode = "login" | "register" | "reset";

export default function LoginPage() {
  const { user, loading, login, register, resetPassword } = useAuth();
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast.success("Welcome back!");
        router.replace("/dashboard");
      } else if (mode === "register") {
        await register(email, password, name || email.split("@")[0]);
        toast.success("Account created — welcome!");
        router.replace("/dashboard");
      } else {
        await resetPassword(email);
        toast.success("Password reset email sent");
        setMode("login");
      }
    } catch (err: any) {
      toast.error(friendlyAuthError(err?.code));
    } finally {
      setSubmitting(false);
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
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login" && "Sign in to continue learning."}
              {mode === "register" && "Set up your personal learning library."}
              {mode === "reset" && "We&apos;ll email you a reset link."}
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
              </Button>
            </form>

            <div className="mt-4 flex flex-col gap-1 text-center text-sm text-muted-foreground">
              {mode === "login" && (
                <>
                  <button className="hover:text-foreground" onClick={() => setMode("reset")}>Forgot your password?</button>
                  <button className="hover:text-foreground" onClick={() => setMode("register")}>New here? Create an account</button>
                </>
              )}
              {mode !== "login" && (
                <button className="hover:text-foreground" onClick={() => setMode("login")}>Back to sign in</button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function friendlyAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match.";
    case "auth/email-already-in-use":
      return "An account already exists for that email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    default:
      return "Something went wrong. Please try again.";
  }
}
