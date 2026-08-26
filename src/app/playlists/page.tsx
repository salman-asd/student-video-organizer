"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { listPlaylists } from "@/lib/firestore/playlists";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ListVideo } from "lucide-react";
import type { Playlist } from "@/types";

export default function PlaylistsPage() {
  return (
    <RequireAuth>
      <PlaylistsContent />
    </RequireAuth>
  );
}

function PlaylistsContent() {
  const [playlists, setPlaylists] = React.useState<Playlist[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    listPlaylists(false).then((p) => { setPlaylists(p); setLoading(false); });
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Playlists</h1>
          <p className="text-sm text-muted-foreground">The shared learning library, curated by your admin.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-lg" />)}
          </div>
        ) : playlists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            No playlists yet. Check back once your admin adds some.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((p) => (
              <Link key={p.id} href={`/playlists/${p.id}`}>
                <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
                  <div className="relative aspect-[16/7] w-full bg-secondary">
                    {p.coverThumbnailUrl ? (
                      <Image src={p.coverThumbnailUrl} alt={p.title} fill className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center"><ListVideo className="h-8 w-8 text-muted-foreground" /></div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5 p-4">
                    <h3 className="font-display text-base font-semibold">{p.title}</h3>
                    {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="mt-auto pt-2"><Badge variant="secondary">{p.videoCount} videos</Badge></div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
