"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { bulkAddVideos, createPlaylist, listPlaylists } from "@/lib/firestore/playlists";
import { extractYouTubeId, youtubeThumbnail } from "@/lib/utils";
import type { Playlist } from "@/types";
import { toast } from "sonner";
import { FileJson, Upload } from "lucide-react";

interface RawRow {
  "Video No"?: number | string;
  "Lesson No"?: number | string;
  "Part No"?: number | string;
  "Page No"?: number | string;
  Title?: string;
  URL?: string;
  "Thumbnail URL"?: string;
  Playlist?: string;
  [key: string]: any;
}

interface PreviewRow {
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  youtubeVideoId: string | null;
  videoNo: number | null;
  lessonNo: number | null;
  partNo: number | null;
  pageNo: number | null;
}

export default function AdminImportJsonPage() {
  return (
    <RequireAdmin>
      <AdminImportJsonContent />
    </RequireAdmin>
  );
}

function num(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function AdminImportJsonContent() {
  const { user } = useAuth();
  const [raw, setRaw] = React.useState("");
  const [rows, setRows] = React.useState<PreviewRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState<string>("");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => { listPlaylists(true).then(setPlaylists); }, []);

  function handleParse() {
    setError(null);
    try {
      const data = JSON.parse(raw);
      const arr: RawRow[] = Array.isArray(data) ? data : data.videos || data.items || [];
      if (!Array.isArray(arr)) throw new Error("Expected a JSON array of video objects.");
      const parsed: PreviewRow[] = arr.map((r) => {
        const url = r.URL || r.url || r.videoUrl || "";
        const ytId = extractYouTubeId(url);
        const thumb = r["Thumbnail URL"] || r.thumbnailUrl || (ytId ? youtubeThumbnail(ytId) : "");
        return {
          title: r.Title || r.title || "Untitled",
          videoUrl: url,
          thumbnailUrl: thumb,
          youtubeVideoId: ytId,
          videoNo: num(r["Video No"] ?? r.videoNo),
          lessonNo: num(r["Lesson No"] ?? r.lessonNo),
          partNo: num(r["Part No"] ?? r.partNo),
          pageNo: num(r["Page No"] ?? r.pageNo),
        };
      });
      setRows(parsed);
      if (!newPlaylistTitle && arr[0]?.Playlist) setNewPlaylistTitle(arr[0].Playlist);
      toast.success(`Parsed ${parsed.length} videos`);
    } catch (e: any) {
      setError(e.message || "Couldn't parse that JSON.");
      setRows([]);
    }
  }

  async function handleImport() {
    if (!user || rows.length === 0) return;
    setImporting(true);
    try {
      let playlistId = targetPlaylistId;
      if (!playlistId) {
        if (!newPlaylistTitle.trim()) { toast.error("Name the new playlist first."); setImporting(false); return; }
        playlistId = await createPlaylist({ title: newPlaylistTitle.trim(), source: "json-import" }, user.uid);
      }
      await bulkAddVideos(playlistId, rows.map((r) => ({
        title: r.title,
        videoUrl: r.videoUrl,
        youtubeVideoId: r.youtubeVideoId,
        thumbnailUrl: r.thumbnailUrl,
        videoNo: r.videoNo,
        lessonNo: r.lessonNo,
        partNo: r.partNo,
        pageNo: r.pageNo,
      })));
      toast.success(`Imported ${rows.length} videos`);
      setRows([]);
      setRaw("");
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
          <h1 className="font-display text-2xl font-semibold">Import JSON</h1>
          <p className="text-sm text-muted-foreground">
            Paste an existing dataset (Video No, Lesson No, Part No, Page No, Title, URL, Thumbnail URL, Playlist).
            Nothing is downloaded — only URLs are stored.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Label className="flex items-center gap-1.5"><FileJson className="h-4 w-4" /> JSON data</Label>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder='[{"Title": "Lesson 1", "URL": "https://youtube.com/watch?v=...", "Lesson No": 1}]'
              className="min-h-[160px] font-mono text-xs"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleParse} disabled={!raw.trim()}>Preview</Button>
          </CardContent>
        </Card>

        {rows.length > 0 && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">Preview</h2>
                <Badge variant="secondary">{rows.length} videos</Badge>
              </div>

              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {rows.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.lessonNo != null && <Badge variant="outline">Lesson {r.lessonNo}</Badge>}
                    {!r.videoUrl && <Badge variant="destructive">Missing URL</Badge>}
                  </div>
                ))}
                {rows.length > 20 && <p className="text-xs text-muted-foreground">…and {rows.length - 20} more</p>}
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
                <Upload className="h-4 w-4" /> {importing ? "Importing…" : `Import ${rows.length} videos`}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
