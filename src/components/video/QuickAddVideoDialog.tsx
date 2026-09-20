"use client";

import * as React from "react";
import { VideoThumbnail } from "@/components/video/VideoThumbnail";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addPersonalVideo, addStandaloneVideo, findDuplicatePersonalVideoUrl } from "@/lib/firestore/personalPlaylists";
import { fetchVideoMetadata, type VideoMetadata } from "@/lib/video-metadata";
import { detectVideoProvider, extractExternalVideoId, normalizeVideoUrl, validateVideoUrl } from "@/lib/video-platforms";
import type { PersonalPlaylist } from "@/types";
import { formatDuration } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthProvider";

export function QuickAddVideoDialog({
  ownerId, playlists, open, onOpenChange, onSaved,
}: {
  ownerId: string;
  playlists: PersonalPlaylist[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const [playlistId, setPlaylistId] = React.useState("");
  const [newUrl, setNewUrl] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [newThumb, setNewThumb] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [metadataPreview, setMetadataPreview] = React.useState<VideoMetadata | null>(null);
  const [urlStatus, setUrlStatus] = React.useState<"idle" | "checking" | "valid" | "manual">("idle");
  const [urlError, setUrlError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [playlistQuery, setPlaylistQuery] = React.useState("");

  React.useEffect(() => {
    let active = true;
    if (!newUrl.trim()) {
      setMetadataPreview(null); setUrlStatus("idle"); setUrlError(null); return;
    }
    const candidate = newUrl.trim();
    const provider = detectVideoProvider(candidate);
    if (!provider || !validateVideoUrl(candidate)) {
      setMetadataPreview(null); setUrlStatus("idle"); setUrlError("That URL is not valid for a supported video platform."); return;
    }
    setUrlStatus("checking"); setUrlError(null);
    Promise.resolve(user?.getIdToken?.()).catch(() => null)
      .then((idToken) => fetchVideoMetadata(candidate, { idToken }))
      .then((meta) => {
        if (!active) return;
        if (!meta) { setUrlStatus("manual"); setUrlError("Metadata unavailable; you can still save manually."); return; }
        setMetadataPreview(meta); setUrlStatus("valid");
        setNewTitle((current) => current || meta.title);
        setNewThumb((current) => current || meta.thumbnailUrl || "");
        setNewDescription((current) => current || meta.description || "");
      })
      .catch(() => { if (active) { setUrlStatus("manual"); setUrlError("Metadata unavailable; you can still save manually."); } });
    return () => { active = false; };
  }, [newUrl, user]);

  function reset() {
    setPlaylistId(""); setPlaylistQuery(""); setNewUrl(""); setNewTitle(""); setNewThumb(""); setNewDescription("");
    setMetadataPreview(null); setUrlStatus("idle"); setUrlError(null); setSaving(false);
  }

  const visiblePlaylists = playlists.filter((playlist) =>
    !playlist.isUnsorted && playlist.title.toLowerCase().includes(playlistQuery.trim().toLowerCase())
  );

  async function handleSave() {
    const candidate = newUrl.trim();
    if (!candidate || !validateVideoUrl(candidate)) { setUrlError("Paste a valid supported video URL first."); return; }
    const normalized = normalizeVideoUrl(candidate) ?? {
      canonicalUrl: candidate, externalVideoId: extractExternalVideoId(candidate),
      platform: detectVideoProvider(candidate)?.platform || "generic",
    };
    const data = {
      title: newTitle.trim() || metadataPreview?.title || "Untitled video",
      videoUrl: metadataPreview?.canonicalUrl || normalized.canonicalUrl || candidate,
      youtubeVideoId: normalized.platform === "youtube" || normalized.platform === "youtube-shorts" ? normalized.externalVideoId : null,
      thumbnailUrl: newThumb.trim() || metadataPreview?.thumbnailUrl || "",
      durationSeconds: metadataPreview?.durationSeconds ?? undefined,
      description: newDescription.trim() || metadataPreview?.description || null,
      creator: metadataPreview?.creator || null,
      publishedAt: metadataPreview?.publishedAt || null,
      platform: normalized.platform,
    } as Parameters<typeof addPersonalVideo>[2];

    setSaving(true);
    try {
      if (playlistId) {
        if (await findDuplicatePersonalVideoUrl(ownerId, playlistId, data.videoUrl)) {
          setUrlError("This video is already in that playlist."); return;
        }
        await addPersonalVideo(ownerId, playlistId, data);
      } else {
        await addStandaloneVideo(ownerId, data);
      }
      toast.success(playlistId ? "Video added" : "Video saved to Unsorted");
      reset(); onOpenChange(false); onSaved?.();
    } catch (error: any) {
      setUrlError(error?.message || "Unable to save this video.");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Save Video</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Playlist (optional)</Label>
            <Select value={playlistId || "unsorted"} onValueChange={(value) => setPlaylistId(value === "unsorted" ? "" : value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <div className="p-1" onKeyDown={(event) => event.stopPropagation()}>
                  <Input
                    value={playlistQuery}
                    onChange={(event) => setPlaylistQuery(event.target.value)}
                    onKeyDown={(event) => event.stopPropagation()}
                    placeholder="Search playlists..."
                    aria-label="Search playlists"
                  />
                </div>
                <SelectItem value="unsorted">Unsorted</SelectItem>
                {visiblePlaylists.map((playlist) => <SelectItem key={playlist.id} value={playlist.id}>{playlist.title}</SelectItem>)}
                {visiblePlaylists.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No playlists found.</p>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Video URL</Label>
            <Input value={newUrl} onChange={(event) => setNewUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
            {urlStatus === "checking" && <p className="text-xs text-muted-foreground">Checking this video...</p>}
            {urlStatus === "valid" && <p className="text-xs text-emerald-600">Metadata detected successfully.</p>}
            {urlStatus === "manual" && <p className="text-xs text-amber-600">Metadata unavailable; you can still save manually.</p>}
            {urlError && <p className="text-xs text-destructive">{urlError}</p>}
          </div>
          {metadataPreview && <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm"><div className="flex gap-3">{metadataPreview.thumbnailUrl && <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md"><VideoThumbnail src={metadataPreview.thumbnailUrl} alt={metadataPreview.title} videoUrl={metadataPreview.canonicalUrl} sizes="128px" /></div>}<div className="min-w-0 space-y-1"><p className="font-medium">{metadataPreview.title}</p>{metadataPreview.creator && <p className="text-xs text-muted-foreground">By {metadataPreview.creator}</p>}{metadataPreview.durationSeconds && <p className="text-xs text-muted-foreground">Duration: {formatDuration(metadataPreview.durationSeconds)}</p>}</div></div></div>}
          <div className="space-y-1.5"><Label>Title</Label><Input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Video title" /></div>
          <div className="space-y-1.5"><Label>Thumbnail URL</Label><Input value={newThumb} onChange={(event) => setNewThumb(event.target.value)} placeholder="https://..." /></div>
          <div className="space-y-1.5"><Label>Description (optional)</Label><textarea value={newDescription} onChange={(event) => setNewDescription(event.target.value)} className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving || urlStatus === "checking" || !newUrl.trim()}>{saving ? "Saving..." : "Save video"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
