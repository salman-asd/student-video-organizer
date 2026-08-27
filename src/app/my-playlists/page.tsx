"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { createPersonalPlaylist, listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import type { PersonalPlaylist } from "@/types";
import { Lock, Plus, ListVideo } from "lucide-react";
import { toast } from "sonner";

export default function MyPlaylistsPage() {
  return (
    <RequireAuth>
      <MyPlaylistsContent />
    </RequireAuth>
  );
}

function MyPlaylistsContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  // Admins can pass ?owner=<uid> to browse/manage a specific student's
  // personal playlists from the Admin > User detail page. Otherwise this is
  // always "my own" playlists.
  const ownerId = searchParams.get("owner") || user?.uid || "";

  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setPlaylists(await listPersonalPlaylists(ownerId));
    setLoading(false);
  }, [ownerId]);

  React.useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!ownerId || !title.trim()) return;
    await createPersonalPlaylist(ownerId, title.trim(), description.trim());
    setTitle(""); setDescription(""); setDialogOpen(false);
    toast.success("Playlist created");
    load();
  }

  const isViewingOther = ownerId !== user?.uid;

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5 text-accent" /> My Playlists
            </h1>
            <p className="text-sm text-muted-foreground">
              {isViewingOther
                ? "Managing this student's personal playlists as admin."
                : "Private to you — no other student can see these."}
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New Playlist</Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : playlists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            No personal playlists yet. Create one to organize videos your own way.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((p) => (
              <Link key={p.id} href={`/my-playlists/${p.id}${isViewingOther ? `?owner=${ownerId}` : ""}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <ListVideo className="h-4 w-4 text-muted-foreground" />
                      <p className="truncate font-medium">{p.title}</p>
                    </div>
                    {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    <Badge variant="secondary">{p.videoCount} videos</Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Personal Playlist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Interview Prep" />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
