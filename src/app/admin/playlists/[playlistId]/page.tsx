"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { SortableList } from "@/components/dnd/SortableList";
import {
  addVideo, getPlaylist, listVideos, removeVideo, reorderVideos, updateVideo,
} from "@/lib/firestore/playlists";
import { extractYouTubeId, formatDuration, youtubeThumbnail } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { detectVideoProvider, generateCanonicalUrl } from "@/lib/video-platforms";
import { fetchVideoMetadata } from "@/lib/video-metadata";
import type { Playlist, Video } from "@/types";
import { ArrowLeft, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function AdminPlaylistEditorPage() {
  return (
    <RequireAdmin>
      <AdminPlaylistEditorContent />
    </RequireAdmin>
  );
}

function AdminPlaylistEditorContent() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();
  const studentId = searchParams.get("student");
  const { user } = useAuth();

  const [playlist, setPlaylist] = React.useState<Playlist | null>(null);
  const [videos, setVideos] = React.useState<Video[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Video | null>(null);

  // Add-video form state
  const [newUrl, setNewUrl] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [newThumb, setNewThumb] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    const [p, vids] = await Promise.all([getPlaylist(playlistId), listVideos(playlistId)]);
    setPlaylist(p);
    setVideos(vids);
    setLoading(false);
  }, [playlistId]);

  React.useEffect(() => { load(); }, [load]);

  async function handleReorder(newOrder: Video[]) {
    setVideos(newOrder);
    await reorderVideos(playlistId, newOrder.map((v) => v.id));
    toast.success("Order saved");
  }

  async function handleAddVideo() {
    if (!newUrl.trim() || !newTitle.trim()) return;
    const candidate = newUrl.trim();
    const ytId = extractYouTubeId(candidate);
    // Platform + canonical URL now come from the same shared detector every
    // other add-video flow uses (see video-platforms/providers.ts), so a
    // pasted Facebook (or Vimeo) link is tagged correctly instead of
    // silently defaulting to no platform at all, which is what happened
    // here before Facebook support existed.
    const platform = detectVideoProvider(candidate)?.platform || "generic";
    const canonicalUrl = generateCanonicalUrl(candidate) || candidate;
    await addVideo(playlistId, {
      title: newTitle.trim(),
      videoUrl: canonicalUrl,
      youtubeVideoId: ytId,
      thumbnailUrl: newThumb.trim() || (ytId ? youtubeThumbnail(ytId) : ""),
      platform,
    } as any);
    setNewUrl(""); setNewTitle(""); setNewThumb(""); setAddOpen(false);
    toast.success("Video added");
    load();
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await updateVideo(playlistId, editing.id, {
      title: editing.title,
      videoUrl: editing.videoUrl,
      thumbnailUrl: editing.thumbnailUrl,
      durationSeconds: editing.durationSeconds,
      lessonNo: editing.lessonNo,
      partNo: editing.partNo,
      pageNo: editing.pageNo,
    });
    setEditing(null);
    toast.success("Video updated");
    load();
  }

  async function handleRemove(video: Video) {
    if (!confirm(`Remove "${video.title}" from this playlist?`)) return;
    await removeVideo(playlistId, video.id);
    toast.success("Video removed");
    load();
  }

  React.useEffect(() => {
    if (!newUrl.trim()) return;

    const ytId = extractYouTubeId(newUrl);
    if (ytId) {
      if (!newThumb) setNewThumb(youtubeThumbnail(ytId));
      return;
    }

    // Facebook has no client-side thumbnail derivation the way YouTube's
    // video-id-based thumbnail URL works — it needs the Graph API oEmbed
    // call (see video-metadata.ts / facebookGraph.ts), so it's only
    // attempted here, behind the same auth token every other Facebook
    // metadata lookup in the app already requires.
    const candidate = newUrl.trim();
    if (detectVideoProvider(candidate)?.platform !== "facebook") return;

    let isActive = true;
    Promise.resolve(user?.getIdToken?.())
      .catch(() => null)
      .then((idToken) => fetchVideoMetadata(candidate, { idToken }))
      .then((meta) => {
        if (!isActive || !meta) return;
        if (!newTitle) setNewTitle(meta.title);
        if (!newThumb && meta.thumbnailUrl) setNewThumb(meta.thumbnailUrl);
      })
      .catch(() => {});
    return () => { isActive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newUrl]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href={studentId ? `/admin/users/${studentId}` : "/admin/playlists"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {studentId ? "Back to Student" : "Back to Playlists"}
        </Link>

        {loading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold">{playlist?.title}</h1>
              <p className="text-sm text-muted-foreground">{videos.length} videos · shared with all students</p>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Video</Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">Drag videos to reorder. Changes save immediately and apply to everyone.</p>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
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
                <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{v.order + 1}</span>
                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-secondary">
                  {v.thumbnailUrl && <Image src={v.thumbnailUrl} alt={v.title} fill className="object-cover" sizes="80px" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-muted-foreground">{formatDuration(v.durationSeconds)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(v)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(v)}><Trash2 className="h-4 w-4" /></Button>
              </Card>
            )}
          />
        )}
      </div>

      {/* Add video dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Video URL</Label>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="YouTube or Facebook video URL" />
            </div>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Video title (auto-filled for Facebook where available)" />
            </div>
            <div className="space-y-1.5">
              <Label>Thumbnail URL (auto-filled for YouTube and, where available, Facebook)</Label>
              <Input value={newThumb} onChange={(e) => setNewThumb(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVideo}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit video dialog */}
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
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label>Lesson #</Label>
                  <Input type="number" value={editing.lessonNo ?? ""} onChange={(e) => setEditing({ ...editing, lessonNo: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Part #</Label>
                  <Input type="number" value={editing.partNo ?? ""} onChange={(e) => setEditing({ ...editing, partNo: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Page #</Label>
                  <Input type="number" value={editing.pageNo ?? ""} onChange={(e) => setEditing({ ...editing, pageNo: e.target.value ? Number(e.target.value) : null })} />
                </div>
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
