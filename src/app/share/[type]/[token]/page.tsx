"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getShareByToken } from "@/lib/firestore/shares";
import { canReadSharedItem } from "@/lib/sharing";
import { getExternalWatchAction } from "@/lib/video-platforms";
import { useAuth } from "@/components/auth/AuthProvider";
import { formatDuration } from "@/lib/utils";
import type { ShareRecord, VideoPlatform } from "@/types";

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
  const { user } = useAuth();
  const [share, setShare] = React.useState<ShareRecord | null>(null);
  const [loading, setLoading] = React.useState(true);

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
  }, user?.uid) : false;

  if (loading) return <AppShell><div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-64 w-full rounded-lg" /><Skeleton className="h-10 w-1/3" /></div></AppShell>;
  if (!share || !canRead) return <AppShell><div className="mx-auto max-w-xl rounded-lg border border-dashed p-10 text-center"><h1 className="font-display text-2xl font-semibold">This share link is unavailable</h1><p className="mt-2 text-sm text-muted-foreground">The item may be private, revoked, or the token is invalid.</p><Link href="/library"><Button className="mt-4">Back to library</Button></Link></div></AppShell>;

  if (share.entityType === "video") {
    const externalWatchAction = getExternalWatchAction(share.videoUrl || "");

    return (
      <AppShell>
        <div className="mx-auto max-w-4xl space-y-5">
          <Card className="overflow-hidden border-0 shadow-sm">
            <div className="relative aspect-video w-full bg-secondary">
              {share.thumbnailUrl ? (
                <Image src={share.thumbnailUrl} alt={share.title} fill className="object-cover" sizes="100vw" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Video preview unavailable</div>
              )}
            </div>

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
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <Card className="overflow-hidden border-0 shadow-sm">
          <div className="relative aspect-[16/5] w-full bg-secondary">
            {share.thumbnailUrl ? (
              <Image src={share.thumbnailUrl} alt={share.title} fill className="object-cover" sizes="100vw" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">Playlist preview unavailable</div>
            )}
          </div>

          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary">{share.visibility === "public" ? "Public" : share.visibility === "unlisted" ? "Anyone with link" : "Private"}</Badge>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Shared playlist</p>
                <h1 className="font-display text-3xl font-semibold leading-tight">{share.title}</h1>
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

            <div className="space-y-3">
              {(share.videos || []).map((video, index) => {
                const watchAction = getExternalWatchAction(video.videoUrl || "");
                return (
                  <Card key={video.id} className="flex flex-col gap-3 p-3 md:flex-row md:items-center">
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
                      <Button variant="outline" size="sm" asChild>
                        <a href={watchAction.href || video.videoUrl} target="_blank" rel="noreferrer">
                          {watchAction.label}
                        </a>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button variant="outline" asChild>
                <Link href="/library">Back to library</Link>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
