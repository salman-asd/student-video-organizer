"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyChangePasswordError } from "@/lib/authErrors";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/emailVerification";

/**
 * Change password for email+password accounts. Firebase requires a recent sign-in for this, so the
 * current password is asked for and used to re-authenticate first; the new password is only set if
 * that succeeds. Nothing is sent to our own server.
 */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user, changePassword, resetPassword } = useAuth();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Never keep passwords in state after the dialog closes.
  React.useEffect(() => {
    if (!open) {
      setCurrent(""); setNext(""); setConfirm(""); setShow(false); setError(null); setSubmitting(false);
    }
  }, [open]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validateNewPassword(current, next, confirm);
    if (problem) { setError(problem); return; }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(current, next);
      toast.success("Password changed.");
      onOpenChange(false);
    } catch (err: any) {
      setError(friendlyChangePasswordError(err?.code));
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot() {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      toast.success(`Reset link sent to ${user.email}`);
    } catch (err: any) {
      toast.error(friendlyChangePasswordError(err?.code));
    }
  }

  const type = show ? "text" : "password";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Enter your current password, then choose a new one (at least {MIN_PASSWORD_LENGTH} characters).</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <Input id="cp-current" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">New password</Label>
            <Input id="cp-new" type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input id="cp-confirm" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </div>

          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-pressed={show}>
              {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
              {show ? "Hide passwords" : "Show passwords"}
            </button>
            <button type="button" onClick={onForgot} className="text-accent hover:underline">Forgot current password?</button>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" loading={submitting} loadingText="Changing…">Change password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
