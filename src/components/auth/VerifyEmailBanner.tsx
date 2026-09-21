"use client";

import * as React from "react";
import { MailWarning, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { friendlyAuthError } from "@/lib/authErrors";
import { resendCooldownRemaining } from "@/lib/emailVerification";

const DISMISS_KEY = "sl:verify-banner-dismissed";

/**
 * Reminder for accounts created BEFORE email verification existed (they are allowed in, see
 * shouldBlockUnverified) and whose email is still unconfirmed. New sign-ups never reach the app
 * unverified, so this only ever shows for those older password accounts. Dismissable per session.
 */
export function VerifyEmailBanner() {
  const { user, emailVerified, hasPasswordProvider, sendVerificationToCurrentUser, refreshEmailVerified } = useAuth();
  const [dismissed, setDismissed] = React.useState(true); // start hidden to avoid a flash
  const [busy, setBusy] = React.useState(false);
  const [lastSentAt, setLastSentAt] = React.useState(0);

  React.useEffect(() => {
    try { setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }
  }, []);

  if (!user || emailVerified || !hasPasswordProvider || dismissed) return null;

  async function send() {
    if (resendCooldownRemaining(lastSentAt, Date.now()) > 0) { toast.info("We just sent one — give it a minute."); return; }
    setBusy(true);
    try {
      await sendVerificationToCurrentUser();
      setLastSentAt(Date.now());
      toast.success(`Verification email sent to ${user?.email}`);
    } catch (err: any) {
      toast.error(friendlyAuthError(err?.code));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const ok = await refreshEmailVerified();
      toast[ok ? "success" : "info"](ok ? "Email verified — thank you!" : "Not verified yet. Open the link in your email first.");
    } catch (err: any) {
      toast.error(friendlyAuthError(err?.code));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <MailWarning className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <span className="flex-1 min-w-[12rem]">Please verify your email address (<strong className="break-all">{user.email}</strong>) to keep your account secure.</span>
      <Button size="sm" variant="outline" onClick={send} disabled={busy}>Send verification email</Button>
      <Button size="sm" variant="ghost" onClick={check} disabled={busy}>I&apos;ve verified</Button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => { setDismissed(true); try { window.sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }}
        className="rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
