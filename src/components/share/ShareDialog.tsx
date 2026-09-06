"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ShareExpiryOption, ShareVisibility } from "@/types";
import { SHARE_EXPIRY_OPTIONS } from "@/types";
import { isShareExpired } from "@/lib/sharing";

const LABELS: Record<ShareVisibility, string> = {
  private: "Private",
  unlisted: "Anyone with link",
  public: "Public",
};

const EXPIRY_LABELS: Record<ShareExpiryOption, string> = {
  never: "Never",
  "1h": "In 1 hour",
  "24h": "In 24 hours",
  "7d": "In 7 days",
  "30d": "In 30 days",
};

function formatExpiryStatus(expiresAt: unknown): string {
  if (expiresAt == null) return "Link never expires.";
  const raw = expiresAt as { toDate?: () => Date } | Date;
  const date = typeof (raw as any)?.toDate === "function" ? (raw as any).toDate() : (raw as Date);
  if (!date || Number.isNaN(date.getTime?.())) return "Link never expires.";
  if (isShareExpired({ expiresAt })) return "Link has expired.";
  return `Expires ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`;
}

export function ShareDialog({
  open,
  onOpenChange,
  shareUrl,
  visibility,
  onVisibilityChange,
  expiresAt,
  expiryOption,
  onExpiryChange,
  onCopy,
  onRevoke,
  onShareToUser,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  visibility: ShareVisibility;
  onVisibilityChange: (next: ShareVisibility) => Promise<void> | void;
  /** Current persisted expiry (Timestamp/Date/null), shown as status text. */
  expiresAt?: unknown;
  /** Selected value of the "Expires" control (an action, not a mirror of expiresAt). */
  expiryOption?: ShareExpiryOption;
  onExpiryChange?: (next: ShareExpiryOption) => Promise<void> | void;
  onCopy: () => Promise<void> | void;
  onRevoke: () => Promise<void> | void;
  onShareToUser?: (email: string) => Promise<void>;
  loading?: boolean;
}) {
  const [working, setWorking] = React.useState(false);
  const [recipientEmail, setRecipientEmail] = React.useState("");

  async function handleVisibility(next: ShareVisibility) {
    setWorking(true);
    try {
      await onVisibilityChange(next);
    } finally {
      setWorking(false);
    }
  }

  async function handleExpiry(next: ShareExpiryOption) {
    if (!onExpiryChange) return;
    setWorking(true);
    try {
      await onExpiryChange(next);
    } finally {
      setWorking(false);
    }
  }

  async function handleRevoke() {
    setWorking(true);
    try {
      await onRevoke();
    } finally {
      setWorking(false);
    }
  }

  async function handleShareToUser() {
    if (!onShareToUser || !recipientEmail.trim()) return;
    setWorking(true);
    try {
      await onShareToUser(recipientEmail.trim());
      setRecipientEmail("");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(value) => handleVisibility(value as ShareVisibility)} disabled={working || loading}>
              <SelectTrigger>
                <SelectValue placeholder="Visibility" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LABELS) as ShareVisibility[]).map((option) => (
                  <SelectItem key={option} value={option}>{LABELS[option]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {onExpiryChange && (
            <div className="space-y-2">
              <Label>Expires</Label>
              <Select
                value={expiryOption ?? "never"}
                onValueChange={(value) => handleExpiry(value as ShareExpiryOption)}
                disabled={working || loading || visibility === "private"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Expires" />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_EXPIRY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{EXPIRY_LABELS[option]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{formatExpiryStatus(expiresAt)}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Share link</Label>
            <Input value={shareUrl} readOnly />
          </div>

          {onShareToUser && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <Label>Share directly with a user</Label>
              <div className="flex gap-2">
                <Input type="email" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="student@example.com" />
                <Button type="button" variant="secondary" onClick={handleShareToUser} disabled={!recipientEmail.trim() || loading || working}>Send</Button>
              </div>
              <p className="text-xs text-muted-foreground">The recipient will see this in Needs approval.</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onCopy()} disabled={!shareUrl || loading || working} className="w-full sm:w-auto">
            Copy link
          </Button>
          <Button type="button" variant="destructive" onClick={() => handleRevoke()} disabled={loading || working} className="w-full sm:w-auto">
            Revoke sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
