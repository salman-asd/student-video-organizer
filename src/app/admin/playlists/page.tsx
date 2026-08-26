"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  archivePlaylist, createPlaylist, deletePlaylist, listPlaylists,
} from "@/lib/firestore/playlists";
import type { Playlist } from "@/types";
import { Plus, Archive, ArchiveRestore, Trash2, ListVideo } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";

export default function AdminPlaylistsPage() {
  return (
    <RequireAdmin>
      <AdminPlaylistsContent />
    </RequireAdmin>
  );
}

function AdminPlaylistsContent() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setPlaylists(await listPlaylists(true));
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!user || !title.trim()) return;
    await createPlaylist({ title: title.trim(), description, source: "manual" }, user.uid);
    setTitle(""); setDescription(""); setDialogOpen(false);
    toast.success("Playlist created");
    load();
  }

  const visible = playlists.filter((p) => showArchived || p.visibility !== "archived");

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Playlists</h1>
            <p className="text-sm text-muted-foreground">The shared learning library visible to all students.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New Playlist</Button>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visible.map((p) => (
              <Card key={p.id} className={p.visibility === "archived" ? "opacity-60" : ""}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <Link href={`/admin/playlists/${p.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ListVideo className="h-4 w-4 text-muted-foreground" />
                      <p className="truncate font-medium">{p.title}</p>
                    </div>
                    {p.description && <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="mt-2 flex gap-1.5">
                      <Badge variant="secondary">{p.videoCount} videos</Badge>
                      {p.visibility === "archived" && <Badge variant="outline">Archived</Badge>}
                      <Badge variant="outline">{p.source}</Badge>
                    </div>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={async () => { await archivePlaylist(p.id, p.visibility !== "archived"); load(); }}>
                        {p.visibility === "archived" ? <><ArchiveRestore className="h-4 w-4" /> Restore</> : <><Archive className="h-4 w-4" /> Archive</>}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => { if (confirm(`Delete "${p.title}" and all its videos? This can't be undone.`)) { await deletePlaylist(p.id); toast.success("Playlist deleted"); load(); } }}>
                        <Trash2 className="h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Playlist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. English Therapy Level 1" />
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
