"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getShareByToken } from "@/lib/firestore/shares";
import { createCategoryIfMissing } from "@/lib/firestore/categoriesTags";
import { bulkAddVideosToPersonalPlaylist, createPersonalPlaylist, listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import { canReadSharedItem } from "@/lib/sharing";
import { detectVideoPlatform, extractExternalVideoId, getExternalWatchAction } from "@/lib/video-platforms";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDuration } from "@/lib/utils";
import type { PersonalPlaylist, ShareRecord, VideoPlatform } from "@/types";
import { ArrowLeft, ArrowUp, Download } from "lucide-react";
import { toast } from "sonner";

function formatPlatformLabel(platform?: VideoPlatform | null): string {
  if (!platform) return "Other";
  return {
    youtube: "YouTube",
    "youtube-shorts": "YouTube Shorts",
    facebook: "Facebook",
    vimeo: "Vimeo",
    generic: "Other",
  }[platform] || "Other";
}

export default function SharedItemPage() {
  const params = useParams<{ type: string; token: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [share, setShare] = React.useState<ShareRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedVideoIndex, setSelectedVideoIndex] = React.useState(0);
  const [personalPlaylists, setPersonalPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [targetPlaylistId, setTargetPlaylistId] = React.useState("");
  const [newPlaylistTitle, setNewPlaylistTitle] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    async function load() {
      if (!params?.token) return;
      const item = await getShareByToken(params.token);
      if (!alive) return;
      setShare(item);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [params?.token]);

  const canRead = share ? canReadSharedItem({
    ownerUid: share.ownerUid,
    visibility: share.visibility,
    revokedAt: share.revokedAt as any,
    token: share.shareToken,
    recipientUid: share.recipientUid,
  }, user?.uid) : false;

  React.useEffect(() => {
    if (share?.recipientUid === user?.uid && share?.approvalStatus === "pending") router.replace("/shared?tab=approval");
  }, [router, share, user?.uid]);

  React.useEffect(() => {
    if (!user || share?.entityType !== "playlist") return;
    listPersonalPlaylists(user.uid).then(setPersonalPlaylists).catch(() => {});
  }, [share?.entityType, user]);

  async function addSharedPlaylist() {
    if (!user || !share || share.entityType !== "playlist" || !share.videos?.length) return;
    setAdding(true);
    try {
      let playlistId = targetPlaylistId;
      const importedPlaylistCategoryId = share.categoryName ? await createCategoryIfMissing(share.categoryName, user.uid) : null;
      if (!playlistId) {
        if (!newPlaylistTitle.trim()) {
          toast.error("Choose a playlist or enter a new playlist name.");
          return;
        }
        playlistId = await createPersonalPlaylist(user.uid, newPlaylistTitle.trim(), share.description || "", "private", importedPlaylistCategoryId);
      }
      const added = await bulkAddVideosToPersonalPlaylist(user.uid, playlistId, await Promise.all(share.videos.map(async (video) => ({
        title: video.title,
        videoUrl: video.videoUrl,
        youtubeVideoId: extractExternalVideoId(video.videoUrl || ""),
        thumbnailUrl: video.thumbnailUrl || "",
        durationSeconds: video.durationSeconds || undefined,
        categoryId: video.categoryName ? await createCategoryIfMissing(video.categoryName, user.uid) : null,
        platform: video.platform || detectVideoPlatform(video.videoUrl || "") || "generic",
      }))));
      toast.success(`${added} video${added === 1 ? "" : "s"} added to your playlist.`);
      setAddOpen(false);
      setTargetPlaylistId("");
      setNewPlaylistTitle("");
    } catch (error: any) {
      toast.error(error?.message || "Unable to add this shared playlist.");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <ShareShell authenticated={!!user}><div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-64 w-full rounded-lg" /><Skeleton className="h-10 w-1/3" /></div></ShareShell>;
  if (!share || !canRead) return <ShareShell authenticated={!!user}><div className="mx-auto max-w-xl rounded-lg border border-dashed p-10 text-center"><h1 className="font-display text-2xl font-semibold">This share link is unavailable</h1><p className="mt-2 text-sm text-muted-foreground">The item may be private, revoked, or the token is invalid.</p><Link href="/library"><Button className="mt-4">Back to library</Button></Link></div></ShareShell>;

  if (share.entityType === "video") {
    const externalWatchAction = getExternalWatchAction(share.videoUrl || "");
    const youtubeVideoId = extractExternalVideoId(share.videoUrl || "");

    return (
      <ShareShell authenticated={!!user}>
        <div className="mx-auto max-w-4xl space-y-5">
          <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft /> Back</Button>
          <Card className="overflow-hidden border-0 shadow-sm">
            <VideoPlayer youtubeVideoId={youtubeVideoId} videoUrl={share.videoUrl || ""} onProgress={() => {}} onPause={() => {}} onEnded={() => {}} />

            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{share.visibility === "public" ? "Public" : share.visibility === "unlisted" ? "Anyone with link" : "Private"}</Badge>
                <Badge variant="outline">{formatPlatformLabel(share.platform)}</Badge>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared video</p>
                <h1 className="font-display text-3xl font-semibold leading-tight">{share.title}</h1>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {share.platform && <span>Platform: {formatPlatformLabel(share.platform)}</span>}
                {share.creatorName && <span>Creator: {share.creatorName}</span>}
              </div>

              {share.description && (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-foreground/90">
                  {share.description}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button asChild>
                  <a href={externalWatchAction.href || share.videoUrl || "/library"} target="_blank" rel="noreferrer">
                    {externalWatchAction.label}
                  </a>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/library">Back to library</Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </ShareShell>
    );
  }

  return (
    <ShareShell authenticated={!!user}>
      <div id="shared-playlist-top" className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft /> Back</Button>
          {user && <Button onClick={() => setAddOpen(true)}><Download /> Add to my playlists</Button>}
        </div>
        <Card className="overflow-hidden border border-border/70 shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-primary/15 via-secondary to-accent/10 px-5 py-8 sm:px-8">
            {share.thumbnailUrl && <Image src={share.thumbnailUrl} alt="" fill className="object-cover opacity-20" sizes="100vw" />}
            <div className="relative space-y-3">
              <Badge variant="secondary">Shared playlist</Badge>
              <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">{share.title}</h1>
              <p className="text-sm text-muted-foreground">{share.videos?.length ?? 0} videos · Select a lesson below to start watching.</p>
            </div>
          </div>

          <div className="space-y-6 p-5 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary">{share.visibility === "public" ? "Public" : share.visibility === "unlisted" ? "Anyone with link" : "Private"}</Badge>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {share.videos?.length ?? 0} videos
              </div>
            </div>

            {share.description && (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-6 text-foreground/90">
                {share.description}
              </div>
            )}

            {share.videos?.[selectedVideoIndex] && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Now playing: {share.videos[selectedVideoIndex].title}</p>
                <VideoPlayer
                  youtubeVideoId={extractExternalVideoId(share.videos[selectedVideoIndex].videoUrl || "")}
                  videoUrl={share.videos[selectedVideoIndex].videoUrl || ""}
                  onProgress={() => {}}
                  onPause={() => {}}
                  onEnded={() => {}}
                />
              </div>
            )}

            <div className="space-y-3">
              {(share.videos || []).map((video, index) => {
                const selected = index === selectedVideoIndex;
                return (
                  <Card key={video.id} className={`flex cursor-pointer flex-col gap-3 p-3 md:flex-row md:items-center ${selected ? "border-primary bg-primary/5" : ""}`} onClick={() => setSelectedVideoIndex(index)}>
                    <div className="relative h-24 w-40 shrink-0 overflow-hidden rounded-md bg-secondary">
                      {video.thumbnailUrl ? (
                        <Image src={video.thumbnailUrl} alt={video.title} fill className="object-cover" sizes="160px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">No preview</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>#{index + 1}</span>
                        {video.platform && <span>• {formatPlatformLabel(video.platform)}</span>}
                      </div>
                      <p className="font-medium leading-snug">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.durationSeconds ? formatDuration(video.durationSeconds) : "Duration unavailable"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button variant={selected ? "default" : "outline"} size="sm" type="button" onClick={() => setSelectedVideoIndex(index)}>
                        {selected ? "Playing" : "Play"}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                <ArrowUp /> Back to top
              </Button>
            </div>
          </div>
        </Card>
      </div>
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add shared playlist to my playlists</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Existing playlist</Label>
              <Select value={targetPlaylistId || "new"} onValueChange={(value) => setTargetPlaylistId(value === "new" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Choose a playlist" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Create a new playlist</SelectItem>
                  {personalPlaylists.filter((playlist) => !playlist.isUnsorted).map((playlist) => <SelectItem key={playlist.id} value={playlist.id}>{playlist.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!targetPlaylistId && <div className="space-y-1.5">
              <Label>New playlist name</Label>
              <Input value={newPlaylistTitle} onChange={(event) => setNewPlaylistTitle(event.target.value)} placeholder={share.title} />
            </div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={addSharedPlaylist} disabled={adding}>{adding ? "Adding..." : "Add playlist"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </ShareShell>
  );
}

function ShareShell({ authenticated, children }: { authenticated: boolean; children: React.ReactNode }) {
  return authenticated ? <AppShell>{children}</AppShell> : <main className="min-h-screen bg-background px-4 py-8">{children}</main>;
}
