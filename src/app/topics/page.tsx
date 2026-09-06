"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { listCategories } from "@/lib/firestore/categoriesTags";
import { listAllPersonalVideos } from "@/lib/firestore/personalPlaylists";
import { listPlaylists, listVideos } from "@/lib/firestore/playlists";
import type { Category } from "@/types";
import { BookOpen } from "lucide-react";

export default function TopicsPage() {
  return <RequireAuth><TopicsContent /></RequireAuth>;
}

function TopicsContent() {
  const { user } = useAuth();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const [nextCategories, personalVideos, suggestedPlaylists] = await Promise.all([
        listCategories(), listAllPersonalVideos(user.uid), listPlaylists(false),
      ]);
      const nextCounts: Record<string, number> = {};
      personalVideos.forEach((video) => { if (video.categoryId) nextCounts[video.categoryId] = (nextCounts[video.categoryId] || 0) + 1; });
      suggestedPlaylists.forEach((playlist) => { if (playlist.categoryId) nextCounts[playlist.categoryId] = (nextCounts[playlist.categoryId] || 0) + 1; });
      for (const playlist of suggestedPlaylists) {
        const videos = await listVideos(playlist.id);
        videos.forEach((video) => { if (video.categoryId) nextCounts[video.categoryId] = (nextCounts[video.categoryId] || 0) + 1; });
      }
      setCategories(nextCategories);
      setCounts(nextCounts);
      setLoading(false);
    })();
  }, [user]);

  return <AppShell><div className="mx-auto max-w-5xl space-y-6">
    <div><h1 className="flex items-center gap-2 font-display text-2xl font-semibold"><BookOpen className="h-5 w-5 text-accent" /> Browse by Topic</h1><p className="mt-1 text-sm text-muted-foreground">Explore your personal content and admin-curated Suggested videos by topic.</p></div>
    {loading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 rounded-lg" />)}</div> : categories.length === 0 ? <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">No topics are available yet.</p> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{categories.map((category) => <Link key={category.id} href={`/library?category=${encodeURIComponent(category.id)}`}><Card className="transition-shadow hover:shadow-md"><CardContent className="space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold">{category.name}</h2><Badge variant="secondary">{counts[category.id] || 0}</Badge></div><p className="text-sm text-muted-foreground">View matching videos in Library</p></CardContent></Card></Link>)}</div>}
  </div></AppShell>;
}
