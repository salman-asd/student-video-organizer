"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listSharesByOwner, listSharesForRecipient, revokeShare, setShareApproval } from "@/lib/firestore/shares";
import type { ShareRecord } from "@/types";
import { Check, Clock3, ExternalLink, ListVideo, MapPin, Settings2, Share2, UserRound, X } from "lucide-react";
import { toast } from "sonner";

export default function SharedPage() {
  return <RequireAuth><SharedContent /></RequireAuth>;
}

function SharedContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [owned, setOwned] = React.useState<ShareRecord[]>([]);
  const [received, setReceived] = React.useState<ShareRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [nextOwned, nextReceived] = await Promise.all([
        listSharesByOwner(user.uid),
        listSharesForRecipient(user.uid),
      ]);
      setOwned(nextOwned);
      setReceived(nextReceived);
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  async function decide(share: ShareRecord, status: "accepted" | "rejected") {
    if (!user) return;
    await setShareApproval(share.shareToken, user.uid, status);
    setReceived((items) => items.map((item) => item.id === share.id ? { ...item, approvalStatus: status } : item));
    toast.success(status === "accepted" ? "Shared item accepted" : "Shared item rejected");
  }

  const all = Array.from(new Map([...owned, ...received].map((item) => [item.id, item])).values());
  const pending = received.filter((item) => item.approvalStatus === "pending");
  const accepted = received.filter((item) => item.approvalStatus === "accepted");
  const allGroups = groupShares(all);
  const ownedGroups = groupShares(owned);
  const acceptedGroups = groupShares(accepted);
  const pendingGroups = groupShares(pending);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold"><Share2 className="h-5 w-5 text-accent" /> Shared</h1>
          <p className="mt-1 text-sm text-muted-foreground">Playlists and videos shared with you or by you.</p>
        </div>

        <Tabs defaultValue={searchParams.get("tab") === "approval" ? "approval" : "all"}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="all">All ({allGroups.length})</TabsTrigger>
            <TabsTrigger value="by-me">Shared by me ({ownedGroups.length})</TabsTrigger>
            <TabsTrigger value="to-me">Shared to me ({acceptedGroups.length})</TabsTrigger>
            <TabsTrigger value="approval">Needs approval ({pendingGroups.length})</TabsTrigger>
          </TabsList>
          {([['all', all], ['by-me', owned], ['to-me', accepted], ['approval', pending]] as const).map(([value, items]) => (
            <TabsContent key={value} value={value}>
              {loading ? <LoadingGrid /> : <ShareGrid items={items} onDecide={decide} viewerUid={user?.uid || ""} onChanged={load} />}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </AppShell>
  );
}

function LoadingGrid() {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-lg" />)}</div>;
}

function groupShares(items: ShareRecord[]): ShareRecord[][] {
  const groups = new Map<string, ShareRecord[]>();
  items.forEach((item) => {
    const key = `${item.entityType}:${item.entityId}`;
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });
  return Array.from(groups.values());
}

function ShareGrid({ items, onDecide, viewerUid, onChanged }: { items: ShareRecord[]; onDecide: (share: ShareRecord, status: "accepted" | "rejected") => Promise<void>; viewerUid: string; onChanged: () => Promise<void> }) {
  if (!items.length) return <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{groupShares(items).map((shares) => <ShareCard key={`${shares[0].entityType}:${shares[0].entityId}`} shares={shares} onDecide={onDecide} viewerUid={viewerUid} onChanged={onChanged} />)}</div>;
}

function ShareCard({ shares, onDecide, viewerUid, onChanged }: { shares: ShareRecord[]; onDecide: (share: ShareRecord, status: "accepted" | "rejected") => Promise<void>; viewerUid: string; onChanged: () => Promise<void> }) {
  const share = shares[0];
  const ownedShares = shares.filter((item) => item.ownerUid === viewerUid);
  const receivedShares = shares.filter((item) => item.ownerUid !== viewerUid);
  const [manageOpen, setManageOpen] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  async function handleRevoke(item: ShareRecord) {
    setWorking(true);
    try {
      await revokeShare(item.shareToken);
      toast.success("Share revoked");
      setManageOpen(false);
      await onChanged();
    } finally {
      setWorking(false);
    }
  }

  async function handleRevokeAll() {
    setWorking(true);
    try {
      await Promise.all(ownedShares.map((item) => revokeShare(item.shareToken)));
      toast.success("All shares revoked");
      setManageOpen(false);
      await onChanged();
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2"><ListVideo className="h-4 w-4 shrink-0 text-muted-foreground" /><p className="truncate font-medium">{share.title || "Untitled"}</p></div>
          <Badge variant="secondary">{share.entityType}</Badge>
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Shared {shares.length} time{shares.length === 1 ? "" : "s"}</p>
          <p className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {share.sharedByName || (share.recipientEmail ? `To ${share.recipientEmail}` : "Shared link")}</p>
        </div>
        {ownedShares.length > 0 && <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
          <Button size="sm" asChild><Link href={share.entityType === "playlist" ? `/my-playlists/${share.entityId}` : "/library"}><MapPin /> Go to {share.entityType === "playlist" ? "playlist" : "video"}</Link></Button>
          <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}><Settings2 /> Manage shares</Button>
        </div>}
        {receivedShares.length > 0 && <div className="space-y-2 border-t border-border pt-2">
          {receivedShares.map((item) => {
            const isPending = item.approvalStatus === "pending";
            return <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{item.recipientEmail || "Anyone with link"}{item.expiresAt ? " · Limited" : ""}</span>
              {isPending ? <span className="flex shrink-0 gap-1"><Button size="sm" onClick={() => onDecide(item, "accepted")}><Check /> Accept</Button><Button size="sm" variant="outline" onClick={() => onDecide(item, "rejected")}><X /> Reject</Button></span> : item.approvalStatus === "rejected" ? <Badge variant="outline">Rejected</Badge> : <Button size="sm" variant="outline" asChild><Link href={`/share/${item.entityType}/${item.shareToken}`}><ExternalLink /> Open</Link></Button>}
            </div>;
          })}
        </div>}
      </CardContent>
      </Card>

      {ownedShares.length > 0 && <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Manage shares: {share.title || "Untitled"}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {ownedShares.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 space-y-1 text-sm">
                <p className="truncate font-medium">{item.recipientEmail || "Anyone with link"}</p>
                <p className="text-xs text-muted-foreground">{item.visibility === "public" ? "Public" : item.visibility === "unlisted" ? "Anyone with link" : "Private"}{item.expiresAt ? " · Time-limited" : " · Never expires"}</p>
              </div>
              <Button size="sm" variant="destructive" disabled={working} onClick={() => handleRevoke(item)}><X /> Revoke</Button>
            </div>)}
          </div>
          <DialogFooter>
            <Button variant="destructive" disabled={working} onClick={handleRevokeAll}><X /> Revoke all</Button>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </>
  );
}