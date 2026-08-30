"use client";

import * as React from "react";
import Image from "next/image";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addVideo, createPlaylist, listPlaylists, listVideos } from "@/lib/firestore/playlists";
import type { Playlist } from "@/types";
import { Youtube, Upload } from "lucide-react";
import { toast } from "sonner";

interface PreviewVideo {
  title: string;
  youtubeVideoId: string | null;
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  order: number;
}

interface ImportPreview {
  title: string;
  description: string;
  thumbnailUrl: string;
  sourceUrl: string;
  totalVideos: number;
  unavailableCount: number;
  videos: PreviewVideo[];
}

export default function AdminImportYouTubePage() {
  return (
    <RequireAdmin>
      <AdminImportYouTubeContent />
    </RequireAdmin>
  );
}

function AdminImportYouTubeContent() {
  const { user } = useAuth();
  const [url, setUrl] = React.useState("");
  const [fetching, setFetching] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState("");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => { listPlaylists(true).then(setPlaylists); }, []);

  async function handleFetch() {
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a YouTube playlist URL to continue.");
      return;
    }

    setFetching(true);
    try {
      const idToken = await user?.getIdToken?.();
      const res = await fetch(`/api/youtube-playlist?url=${encodeURIComponent(trimmed)}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch playlist");

      const nextPreview: ImportPreview = {
        title: data.title || "Imported playlist",
        description: data.description || "",
        thumbnailUrl: data.thumbnailUrl || "",
        sourceUrl: data.sourceUrl || trimmed,
        totalVideos: Number(data.totalVideos ?? data.videos?.length ?? 0),
        unavailableCount: Number(data.unavailableCount ?? 0),
        videos: Array.isArray(data.videos) ? data.videos.map((video: PreviewVideo) => ({
          title: video.title,
          youtubeVideoId: video.youtubeVideoId || null,
          videoUrl: video.videoUrl,
          thumbnailUrl: video.thumbnailUrl || "",
          durationSeconds: typeof video.durationSeconds === "number" ? video.durationSeconds : null,
          order: video.order ?? 0,
        })) : [],
      };

      setPreview(nextPreview);
      toast.success(`Found ${nextPreview.videos.length} available videos`);
    } catch (e: any) {
      setPreview(null);
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleImport() {
    if (!user || !preview || preview.videos.length === 0) return;
    setImporting(true);

    try {
      let playlistId = targetPlaylistId;
      if (!playlistId) {
        const playlistName = newPlaylistTitle.trim() || preview.title.trim() || "Imported Playlist";
        playlistId = await createPlaylist({
          title: playlistName,
          description: preview.description,
          source: "youtube-import",
          sourceUrl: preview.sourceUrl,
        }, user.uid);
      }

      const existingVideos = await listVideos(playlistId);
      const existingYoutubeIds = new Set(
        existingVideos
          .filter((video) => Boolean(video.youtubeVideoId))
          .map((video) => video.youtubeVideoId as string)
      );
      const existingUrls = new Set(existingVideos.map((video) => video.videoUrl));

      const videosToImport = preview.videos.filter((video) => {
        if (video.youtubeVideoId && existingYoutubeIds.has(video.youtubeVideoId)) return false;
        if (existingUrls.has(video.videoUrl)) return false;
        return true;
      });

      let imported = 0;
      let duplicates = preview.videos.length - videosToImport.length;
      let failed = 0;

      for (const video of videosToImport) {
        try {
          await addVideo(playlistId, {
            title: video.title,
            videoUrl: video.videoUrl,
            youtubeVideoId: video.youtubeVideoId,
            thumbnailUrl: video.thumbnailUrl,
            durationSeconds: video.durationSeconds ?? undefined,
            platform: "youtube",
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }

      toast.success(`Imported ${imported} videos (${duplicates} already existed, ${failed} failed)`);
      setPreview(null);
      setUrl("");
      setNewPlaylistTitle("");
      setTargetPlaylistId("");
      listPlaylists(true).then(setPlaylists);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Import YouTube Playlist</h1>
          <p className="text-sm text-muted-foreground">
            Order and metadata are pulled from YouTube&apos;s public API. Nothing is downloaded — only URLs and thumbnail links are stored.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Label className="flex items-center gap-1.5"><Youtube className="h-4 w-4" /> Playlist URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=..." className="w-full" />
              <Button onClick={handleFetch} disabled={fetching || !url.trim()} className="w-full sm:w-auto">{fetching ? "Fetching…" : "Fetch"}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!process.env.NEXT_PUBLIC_HAS_YT_KEY && (
              <p className="text-xs text-muted-foreground">Requires a YOUTUBE_API_KEY set on the server (see README).</p>
            )}
          </CardContent>
        </Card>

        {preview && preview.videos.length > 0 && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-base font-semibold">{preview.title}</h2>
                  <p className="text-xs text-muted-foreground">{preview.description || "YouTube playlist preview"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{preview.videos.length} available</Badge>
                  {preview.unavailableCount > 0 && <Badge variant="outline">{preview.unavailableCount} unavailable</Badge>}
                </div>
              </div>

              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {preview.videos.map((v, i) => (
                  <div key={`${v.videoUrl}-${i}`} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded bg-secondary">
                      {v.thumbnailUrl && <Image src={v.thumbnailUrl} alt={v.title} fill className="object-cover" sizes="64px" />}
                    </div>
                    <span className="min-w-0 flex-1 truncate">{v.title}</span>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Import into existing playlist</Label>
                  <Select value={targetPlaylistId} onValueChange={setTargetPlaylistId}>
                    <SelectTrigger><SelectValue placeholder="Choose a playlist" /></SelectTrigger>
                    <SelectContent>
                      {playlists.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>…or create a new playlist</Label>
                  <Input value={newPlaylistTitle} onChange={(e) => { setNewPlaylistTitle(e.target.value); setTargetPlaylistId(""); }} placeholder="New playlist name" />
                </div>
              </div>

              <Button onClick={handleImport} disabled={importing}>
                <Upload className="h-4 w-4" /> {importing ? "Importing…" : `Import ${preview.videos.length} videos`}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
