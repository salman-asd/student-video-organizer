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
import { bulkAddVideos, createPlaylist, listPlaylists } from "@/lib/firestore/playlists";
import { extractYouTubePlaylistId } from "@/lib/utils";
import type { Playlist } from "@/types";
import { Youtube, Upload } from "lucide-react";
import { toast } from "sonner";

interface PreviewVideo {
  title: string; youtubeVideoId: string; videoUrl: string; thumbnailUrl: string; order: number;
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
  const [videos, setVideos] = React.useState<PreviewVideo[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState("");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => { listPlaylists(true).then(setPlaylists); }, []);

  async function handleFetch() {
    setError(null);
    const playlistId = extractYouTubePlaylistId(url);
    if (!playlistId) { setError("Couldn't find a playlist ID in that URL — make sure it includes ?list=…"); return; }
    setFetching(true);
    try {
      const res = await fetch(`/api/youtube-playlist?playlistId=${encodeURIComponent(playlistId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch playlist");
      setVideos(data.videos);
      toast.success(`Found ${data.videos.length} videos`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFetching(false);
    }
  }

  async function handleImport() {
    if (!user || videos.length === 0) return;
    setImporting(true);
    try {
      let playlistId = targetPlaylistId;
      if (!playlistId) {
        if (!newPlaylistTitle.trim()) { toast.error("Name the new playlist first."); setImporting(false); return; }
        playlistId = await createPlaylist({ title: newPlaylistTitle.trim(), source: "youtube-import", sourceUrl: url }, user.uid);
      }
      await bulkAddVideos(playlistId, videos.map((v) => ({
        title: v.title, videoUrl: v.videoUrl, youtubeVideoId: v.youtubeVideoId, thumbnailUrl: v.thumbnailUrl,
      })));
      toast.success(`Imported ${videos.length} videos`);
      setVideos([]);
      setUrl("");
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
            Order and metadata are pulled from YouTube's public API. Nothing is downloaded — only URLs and thumbnail links are stored.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Label className="flex items-center gap-1.5"><Youtube className="h-4 w-4" /> Playlist URL</Label>
            <div className="flex gap-2">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=..." />
              <Button onClick={handleFetch} disabled={fetching || !url.trim()}>{fetching ? "Fetching…" : "Fetch"}</Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!process.env.NEXT_PUBLIC_HAS_YT_KEY && (
              <p className="text-xs text-muted-foreground">Requires a YOUTUBE_API_KEY set on the server (see README).</p>
            )}
          </CardContent>
        </Card>

        {videos.length > 0 && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Preview</h2>
                <Badge variant="secondary">{videos.length} videos</Badge>
              </div>

              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {videos.map((v, i) => (
                  <div key={v.youtubeVideoId} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
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
                <Upload className="h-4 w-4" /> {importing ? "Importing…" : `Import ${videos.length} videos`}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
