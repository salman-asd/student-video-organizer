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
import { addVideo, createPlaylist, listPlaylists, listVideos } from "@/lib/firestore/playlists";
import { fetchVideoMetadata } from "@/lib/video-metadata";
import { detectVideoPlatform, normalizeVideoUrl } from "@/lib/video-platforms";
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
  url?: string;
  title?: string;
  thumbnailUrl?: string;
  [key: string]: any;
}

interface PreviewRow {
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  youtubeVideoId: string | null;
  platform: string;
  videoNo: number | null;
  lessonNo: number | null;
  partNo: number | null;
  pageNo: number | null;
  reason?: string;
}

interface ImportSummary {
  imported: number;
  duplicates: number;
  invalid: number;
  failed: number;
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
  const [invalidRows, setInvalidRows] = React.useState<Array<{ index: number; reason: string }>>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState<string>("");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);

  React.useEffect(() => { listPlaylists(true).then(setPlaylists); }, []);

  async function parseJsonRows(input: string, idToken?: string | null): Promise<{ valid: PreviewRow[]; invalid: Array<{index: number; reason: string}> }> {
    const data = JSON.parse(input);
    const arr: RawRow[] = Array.isArray(data) ? data : data.videos || data.items || [];
    if (!Array.isArray(arr)) throw new Error("Expected a JSON array of video objects.");

    const valid: PreviewRow[] = [];
    const invalid: Array<{ index: number; reason: string }> = [];

    for (let index = 0; index < arr.length; index += 1) {
      const item = arr[index];
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        invalid.push({ index: index + 1, reason: "Entry is not an object." });
        continue;
      }

      const candidateUrl = (item.url ?? item.URL ?? item.videoUrl ?? item.videoURL ?? item.href ?? "").toString().trim();
      if (!candidateUrl) {
        invalid.push({ index: index + 1, reason: "Missing video URL." });
        continue;
      }

      const normalized = normalizeVideoUrl(candidateUrl);
      if (!normalized) {
        invalid.push({ index: index + 1, reason: "URL is not a valid supported video URL." });
        continue;
      }

      // Facebook rows need an auth token for their metadata lookup (Graph
      // API call behind /api/facebook-video — see video-metadata.ts); it's
      // fetched once above and threaded through here rather than per-row.
      // YouTube/Vimeo rows ignore it.
      const metadata = await fetchVideoMetadata(candidateUrl, { idToken });
      const title = (item.title ?? item.Title ?? metadata?.title ?? "Untitled video").toString().trim() || "Untitled video";
      const platform = detectVideoPlatform(candidateUrl) ?? normalized.platform;
      const ytId = platform === "youtube" || platform === "youtube-shorts"
        ? (extractYouTubeId(candidateUrl) ?? normalized.externalVideoId ?? null)
        : null;
      const thumb = (item.thumbnailUrl ?? item["Thumbnail URL"] ?? item.thumbnail ?? metadata?.thumbnailUrl ?? (ytId ? youtubeThumbnail(ytId) : "")).toString().trim();

      valid.push({
        title,
        videoUrl: normalized.canonicalUrl || candidateUrl,
        thumbnailUrl: thumb,
        youtubeVideoId: ytId,
        platform,
        videoNo: num(item["Video No"] ?? item.videoNo),
        lessonNo: num(item["Lesson No"] ?? item.lessonNo),
        partNo: num(item["Part No"] ?? item.partNo),
        pageNo: num(item["Page No"] ?? item.pageNo),
      });
    }

    return { valid, invalid };
  }

  function handleParse() {
    setError(null);
    setSummary(null);
    void (async () => {
      try {
        const idToken = await user?.getIdToken?.().catch(() => null);
        const { valid, invalid } = await parseJsonRows(raw, idToken);
        setRows(valid);
        setInvalidRows(invalid);
        if (!newPlaylistTitle && Array.isArray(JSON.parse(raw)) && JSON.parse(raw)[0]?.Playlist) {
          setNewPlaylistTitle(JSON.parse(raw)[0].Playlist);
        }
        toast.success(`Parsed ${valid.length} valid videos; ${invalid.length} invalid entries skipped.`);
      } catch (e: any) {
        setError(e.message || "Couldn't parse that JSON.");
        setRows([]);
        setInvalidRows([]);
      }
    })();
  }

  async function handleImport() {
    if (!user || rows.length === 0) return;
    setImporting(true);

    try {
      let playlistId = targetPlaylistId;
      if (!playlistId) {
        if (!newPlaylistTitle.trim()) {
          toast.error("Name the new playlist first.");
          setImporting(false);
          return;
        }
        playlistId = await createPlaylist({
          title: newPlaylistTitle.trim(),
          description: "",
          source: "json-import",
          sourceUrl: "" ,
        }, user.uid);
      }

      const existingVideos = await listVideos(playlistId);
      const existingKeys = new Set<string>();
      for (const video of existingVideos) {
        const key = video.youtubeVideoId ? `yt:${video.youtubeVideoId}` : `url:${video.videoUrl}`;
        existingKeys.add(key);
      }

      const seen = new Set<string>();
      let imported = 0;
      let duplicates = 0;
      let failed = 0;

      for (const row of rows) {
        const duplicateKey = row.youtubeVideoId ? `yt:${row.youtubeVideoId}` : `url:${row.videoUrl}`;
        if (existingKeys.has(duplicateKey) || seen.has(duplicateKey)) {
          duplicates += 1;
          continue;
        }

        seen.add(duplicateKey);
        try {
          await addVideo(playlistId, {
            title: row.title,
            videoUrl: row.videoUrl,
            youtubeVideoId: row.youtubeVideoId,
            thumbnailUrl: row.thumbnailUrl,
            platform: row.platform as any,
            videoNo: row.videoNo,
            lessonNo: row.lessonNo,
            partNo: row.partNo,
            pageNo: row.pageNo,
          });
          imported += 1;
        } catch {
          failed += 1;
        }
      }

      const summaryResult: ImportSummary = {
        imported,
        duplicates,
        invalid: invalidRows.length,
        failed,
      };
      setSummary(summaryResult);
      toast.success(`Imported ${imported} video${imported === 1 ? "" : "s"}; ${duplicates} duplicates skipped; ${failed} failed.`);
      setRows([]);
      setInvalidRows([]);
      setRaw("");
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
                <Badge variant="secondary">{rows.length} valid videos</Badge>
              </div>

              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {rows.slice(0, 20).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.platform && <Badge variant="outline">{r.platform}</Badge>}
                    {r.lessonNo != null && <Badge variant="outline">Lesson {r.lessonNo}</Badge>}
                  </div>
                ))}
                {rows.length > 20 && <p className="text-xs text-muted-foreground">…and {rows.length - 20} more</p>}
              </div>

              {invalidRows.length > 0 && (
                <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <h3 className="text-sm font-semibold text-destructive">Invalid entries</h3>
                  <ul className="space-y-1 text-xs text-destructive">
                    {invalidRows.map((row) => (
                      <li key={`${row.index}-${row.reason}`}>Item {row.index}: {row.reason}</li>
                    ))}
                  </ul>
                </div>
              )}

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

        {summary && (
          <Card>
            <CardContent className="space-y-2 p-4">
              <h2 className="font-display text-base font-semibold">Import summary</h2>
              <div className="grid gap-2 sm:grid-cols-4">
                <Badge variant="secondary">Imported: {summary.imported}</Badge>
                <Badge variant="outline">Duplicates: {summary.duplicates}</Badge>
                <Badge variant="outline">Invalid: {summary.invalid}</Badge>
                <Badge variant="outline">Failed: {summary.failed}</Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}