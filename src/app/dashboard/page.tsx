"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { FilterBar } from "@/components/filters/FilterBar";
import { VideoGrid } from "@/components/video/VideoGrid";
import { VideoCard } from "@/components/video/VideoCard";
import { listCategories, listTags } from "@/lib/firestore/categoriesTags";
import { applyFilters, applySort } from "@/lib/filterSort";
import type { Category, HomeFilters, SortOption, Tag } from "@/types";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user, profile } = useAuth();
  const { loading, playlists, videos } = useVideoLibrary(user?.uid);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [filters, setFilters] = React.useState<HomeFilters>({});
  const [sort, setSort] = React.useState<SortOption>("recently-added");

  React.useEffect(() => {
    listCategories().then(setCategories);
    listTags().then(setTags);
  }, []);

  const continueLearning = React.useMemo(
    () => videos.filter((v) => v.state?.status === "in_progress").sort((a, b) => (b.state?.watchedPercentage || 0) - (a.state?.watchedPercentage || 0)).slice(0, 4),
    [videos]
  );

  const filtered = React.useMemo(() => applySort(applyFilters(videos, filters), sort), [videos, filters, sort]);

  return (
    <AppShell onSearch={(q) => setFilters((f) => ({ ...f, query: q }))}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting()}, {profile?.displayName?.split(" ")[0] || "there"}
          </p>
          <h1 className="font-display text-2xl font-semibold">What are you learning today?</h1>
        </div>

        {!loading && continueLearning.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold">Continue Learning</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {continueLearning.map((v) => <VideoCard key={v.id} video={v} />)}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Library</h2>
            <span className="text-sm text-muted-foreground">{filtered.length} videos</span>
          </div>
          <FilterBar
            playlists={playlists}
            categories={categories}
            tags={tags}
            filters={filters}
            sort={sort}
            onFiltersChange={setFilters}
            onSortChange={setSort}
          />
          <VideoGrid videos={filtered} loading={loading} emptyTitle="No videos match your filters" emptyHint="Try clearing a filter or check back once an admin adds content." />
        </section>
      </div>
    </AppShell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
