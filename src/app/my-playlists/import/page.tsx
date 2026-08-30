"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createPersonalPlaylist, listPersonalPlaylists, bulkAddVideosToPersonalPlaylist,
} from "@/lib/firestore/personalPlaylists";
import type { PersonalPlaylist } from "@/types";
import { ArrowLeft, Youtube, Upload, CheckCircle2 } from "lucide-react";
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

export default function ImportYouTubePlaylistPage() {
  return (
    <RequireAuth>
      <ImportContent />
    </RequireAuth>
  );
}

function ImportContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [url, setUrl] = React.useState("");
  const [fetching, setFetching] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState(() => searchParams.get("target") || "");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<{ imported: number; duplicates: number } | null>(null);

  React.useEffect(() => {
    if (!user?.uid) return;
    listPersonalPlaylists(user.uid).then(setPlaylists).catch(() => setPlaylists([]));
  }, [user?.uid]);

  async function handleFetch() {
    setError(null);
    setResult(null);
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
      setNewPlaylistTitle(nextPreview.title);
      toast.success(`Found ${nextPreview.videos.length} available videos`);
    } catch (e: any) {
      setPreview(null);
      setError(e.message || "Failed to fetch playlist");
    } finally {
      setFetching(false);
    }
  }

  async function handleImport() {
    if (!user || !preview || preview.videos.length === 0) return;
    setImporting(true);
    setError(null);

    try {
      let playlistId = targetPlaylistId;
      if (!playlistId) {
        const playlistName = newPlaylistTitle.trim() || preview.title.trim() || "Imported Playlist";
        playlistId = await createPersonalPlaylist(user.uid, playlistName, preview.description, "private");
      }

      const imported = await bulkAddVideosToPersonalPlaylist(
        user.uid,
        playlistId,
        preview.videos.map((video) => ({
          title: video.title,
          videoUrl: video.videoUrl,
          youtubeVideoId: video.youtubeVideoId,
          thumbnailUrl: video.thumbnailUrl,
          durationSeconds: video.durationSeconds ?? undefined,
          platform: "youtube" as const,
        }))
      );
      const duplicates = preview.videos.length - imported;

      setResult({ imported, duplicates });
      toast.success(`Imported ${imported} videos${duplicates ? ` (${duplicates} already existed)` : ""}`);

      // Reflect the (possibly newly created) target playlist in the picker
      // and clear the preview so a second import starts clean.
      const refreshed = await listPersonalPlaylists(user.uid);
      setPlaylists(refreshed);
      setTargetPlaylistId(playlistId);
      setPreview(null);
      setUrl("");
    } catch (e: any) {
      setError(e.message || "Import failed. Please try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/my-playlists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to My Playlists
          </Link>
          <h1 className="mt-2 flex items-center gap-2 font-display text-2xl font-semibold">
            <Youtube className="h-5 w-5 text-accent" /> Import YouTube Playlist
          </h1>
          <p className="text-sm text-muted-foreground">
            Paste a YouTube playlist link to copy its videos into one of your own personal playlists. This is a one-time import —
            the app never re-syncs with the original playlist afterward, so you&apos;re free to reorder, remove, or add to it.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Label htmlFor="playlist-url">YouTube playlist URL</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="playlist-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=..."
                onKeyDown={(e) => { if (e.key === "Enter") handleFetch(); }}
              />
              <Button onClick={handleFetch} disabled={fetching || !url.trim()}>
                {fetching ? "Fetching…" : "Fetch"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        {result && (
          <Card className="border-accent/30 bg-accent/5">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
              <p className="text-sm">
                Imported <strong>{result.imported}</strong> video{result.imported === 1 ? "" : "s"}
                {result.duplicates > 0 && <> — {result.duplicates} already existed and {result.duplicates === 1 ? "was" : "were"} skipped</>}.
                {" "}
                <Link href={targetPlaylistId ? `/my-playlists/${targetPlaylistId}` : "/my-playlists"} className="font-medium text-accent underline">
                  View playlist →
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {preview && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex gap-3">
                {preview.thumbnailUrl && (
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-secondary">
                    <Image src={preview.thumbnailUrl} alt={preview.title} fill className="object-cover" sizes="112px" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate font-medium">{preview.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{preview.videos.length} available</Badge>
                    {preview.unavailableCount > 0 && (
                      <Badge variant="outline">{preview.unavailableCount} unavailable — skipped</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Add to</Label>
                <Select value={targetPlaylistId} onValueChange={setTargetPlaylistId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Create a new playlist" />
                  </SelectTrigger>
                  <SelectContent>
                    {playlists.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title} ({p.videoCount} videos)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!targetPlaylistId && (
                <div className="space-y-1.5">
                  <Label>New playlist name</Label>
                  <Input value={newPlaylistTitle} onChange={(e) => setNewPlaylistTitle(e.target.value)} placeholder="Playlist name" />
                </div>
              )}

              {importing && <p className="text-xs text-muted-foreground">Importing videos — this can take a moment for large playlists…</p>}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setPreview(null); setUrl(""); }} disabled={importing}>Cancel</Button>
                <Button onClick={handleImport} disabled={importing || preview.videos.length === 0}>
                  <Upload className="h-4 w-4" /> {importing ? "Importing…" : `Import ${preview.videos.length} videos`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
