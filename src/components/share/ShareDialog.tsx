"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ShareVisibility } from "@/types";

const LABELS: Record<ShareVisibility, string> = {
  private: "Private",
  unlisted: "Anyone with link",
  public: "Public",
};

export function ShareDialog({
  open,
  onOpenChange,
  shareUrl,
  visibility,
  onVisibilityChange,
  onCopy,
  onRevoke,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareUrl: string;
  visibility: ShareVisibility;
  onVisibilityChange: (next: ShareVisibility) => Promise<void> | void;
  onCopy: () => Promise<void> | void;
  onRevoke: () => Promise<void> | void;
  loading?: boolean;
}) {
  const [working, setWorking] = React.useState(false);

  async function handleVisibility(next: ShareVisibility) {
    setWorking(true);
    try {
      await onVisibilityChange(next);
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

          <div className="space-y-2">
            <Label>Share link</Label>
            <Input value={shareUrl} readOnly />
          </div>
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
