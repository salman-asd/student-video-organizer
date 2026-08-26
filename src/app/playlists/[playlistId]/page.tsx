"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { getPlaylist, listVideos } from "@/lib/firestore/playlists";
import { getAllUserVideoStates } from "@/lib/firestore/userVideoState";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/utils";
import type { Playlist, VideoWithState } from "@/types";
import { CheckCircle2, PlayCircle } from "lucide-react";

export default function PlaylistDetailPage() {
  return (
    <RequireAuth>
      <PlaylistDetailContent />
    </RequireAuth>
  );
}

function PlaylistDetailContent() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const { user } = useAuth();
  const [playlist, setPlaylist] = React.useState<Playlist | null>(null);
  const [videos, setVideos] = React.useState<VideoWithState[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const [p, vids, states] = await Promise.all([
        getPlaylist(playlistId),
        listVideos(playlistId),
        getAllUserVideoStates(user.uid),
      ]);
      setPlaylist(p);
      setVideos(vids.map((v) => ({ ...v, state: states[v.id] || null, playlistTitle: p?.title })));
      setLoading(false);
    })();
  }, [playlistId, user]);

  const completedCount = videos.filter((v) => v.state?.status === "completed").length;
  const overallPct = videos.length ? Math.round((completedCount / videos.length) * 100) : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        {loading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : (
          <div>
            <h1 className="font-display text-2xl font-semibold">{playlist?.title}</h1>
            {playlist?.description && <p className="mt-1 text-sm text-muted-foreground">{playlist.description}</p>}
            <div className="mt-3 flex items-center gap-3">
              <Progress value={overallPct} className="w-40" />
              <span className="text-sm text-muted-foreground">{completedCount}/{videos.length} completed</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            : videos.map((v, i) => (
                <Link
                  key={v.id}
                  href={`/video/${v.id}?playlist=${playlistId}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-secondary/50"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-secondary">
                    <Image src={v.thumbnailUrl} alt={v.title} fill className="object-cover" sizes="96px" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{v.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDuration(v.durationSeconds)}</p>
                  </div>
                  {v.state?.status === "completed" ? (
                    <Badge variant="success"><CheckCircle2 className="h-3 w-3" /> Done</Badge>
                  ) : v.state?.status === "in_progress" ? (
                    <Badge variant="secondary"><PlayCircle className="h-3 w-3" /> {v.state.watchedPercentage}%</Badge>
                  ) : null}
                </Link>
              ))}
        </div>
      </div>
    </AppShell>
  );
}
