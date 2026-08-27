"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SortableList } from "@/components/dnd/SortableList";
import {
  addPersonalVideo, deletePersonalPlaylist, getPersonalPlaylist,
  listPersonalVideos, removePersonalVideo, reorderPersonalVideos,
  renamePersonalPlaylist, updatePersonalVideoMeta,
} from "@/lib/firestore/personalPlaylists";
import { extractYouTubeId, formatDuration, youtubeThumbnail } from "@/lib/utils";
import type { PersonalPlaylist, PersonalVideo } from "@/types";
import { ArrowLeft, GripVertical, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function PersonalPlaylistEditorPage() {
  return (
    <RequireAuth>
      <PersonalPlaylistEditorContent />
    </RequireAuth>
  );
}

function PersonalPlaylistEditorContent() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();
  const { user, isAdmin } = useAuth();
  const ownerId = searchParams.get("owner") || user?.uid || "";
  const isViewingOther = ownerId !== user?.uid;

  const [playlist, setPlaylist] = React.useState<PersonalPlaylist | null>(null);
  const [videos, setVideos] = React.useState<PersonalVideo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PersonalVideo | null>(null);

  const [newUrl, setNewUrl] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [newThumb, setNewThumb] = React.useState("");

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [p, vids] = await Promise.all([
      getPersonalPlaylist(ownerId, playlistId),
      listPersonalVideos(ownerId, playlistId),
    ]);
    setPlaylist(p);
    setVideos(vids);
    setLoading(false);
  }, [ownerId, playlistId]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (newUrl) {
      const ytId = extractYouTubeId(newUrl);
      if (ytId && !newThumb) setNewThumb(youtubeThumbnail(ytId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newUrl]);

  async function handleReorder(newOrder: PersonalVideo[]) {
    setVideos(newOrder);
    await reorderPersonalVideos(ownerId, playlistId, newOrder.map((v) => v.id));
  }

  async function handleAddVideo() {
    if (!newUrl.trim() || !newTitle.trim()) return;
    const ytId = extractYouTubeId(newUrl);
    await addPersonalVideo(ownerId, playlistId, {
      title: newTitle.trim(),
      videoUrl: newUrl.trim(),
      youtubeVideoId: ytId,
      thumbnailUrl: newThumb.trim() || (ytId ? youtubeThumbnail(ytId) : ""),
    });
    setNewUrl(""); setNewTitle(""); setNewThumb(""); setAddOpen(false);
    toast.success("Video added");
    load();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await updatePersonalVideoMeta(ownerId, playlistId, editing.id, {
      title: editing.title, videoUrl: editing.videoUrl, thumbnailUrl: editing.thumbnailUrl,
    });
    setEditing(null);
    toast.success("Video updated");
    load();
  }

  async function handleRemove(v: PersonalVideo) {
    if (!confirm(`Remove "${v.title}" from this playlist?`)) return;
    await removePersonalVideo(ownerId, playlistId, v.id);
    toast.success("Video removed");
    load();
  }

  async function handleDeletePlaylist() {
    if (!confirm(`Delete "${playlist?.title}" and all its videos? This can't be undone.`)) return;
    await deletePersonalPlaylist(ownerId, playlistId);
    toast.success("Playlist deleted");
    window.location.href = isViewingOther ? `/my-playlists?owner=${ownerId}` : "/my-playlists";
  }

  const backHref = isViewingOther ? `/my-playlists?owner=${ownerId}` : "/my-playlists";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {isViewingOther ? "Their Playlists" : "My Playlists"}
        </Link>

        {loading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
                <Lock className="h-5 w-5 text-accent" /> {playlist?.title}
              </h1>
              <p className="text-sm text-muted-foreground">{videos.length} videos · private{isViewingOther ? " to this student" : ""}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDeletePlaylist}><Trash2 className="h-4 w-4" /> Delete Playlist</Button>
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Video</Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Drag to reorder. Only {isViewingOther ? "this student and admins" : "you (and admins)"} can see this playlist.</p>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : videos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No videos yet. Add the first one.</p>
        ) : (
          <SortableList
            items={videos}
            getId={(v) => v.id}
            onReorder={handleReorder}
            className="space-y-2"
            renderItem={(v, dragHandleProps) => (
              <Card className="flex items-center gap-3 p-2.5">
                <span {...dragHandleProps} className="cursor-grab p-1 text-muted-foreground"><GripVertical className="h-4 w-4" /></span>
                <Link href={`/my-playlists/${playlistId}/${v.id}${isViewingOther ? `?owner=${ownerId}` : ""}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                    {v.thumbnailUrl && <Image src={v.thumbnailUrl} alt={v.title} fill className="object-cover" sizes="80px" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(v.durationSeconds)} · {v.watchedPercentage}% watched</p>
                  </div>
                </Link>
                {v.status === "completed" && <Badge variant="success">Done</Badge>}
                <Button variant="ghost" size="icon" onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(v)}><Trash2 className="h-4 w-4" /></Button>
              </Card>
            )}
          />
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Video URL</Label>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Video title" />
            </div>
            <div className="space-y-1.5">
              <Label>Thumbnail URL (auto-filled for YouTube)</Label>
              <Input value={newThumb} onChange={(e) => setNewThumb(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVideo}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Video</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Video URL</Label>
                <Input value={editing.videoUrl} onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Thumbnail URL</Label>
                <Input value={editing.thumbnailUrl} onChange={(e) => setEditing({ ...editing, thumbnailUrl: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
