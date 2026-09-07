"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPersonalPlaylist, listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import type { PersonalPlaylist, PersonalPlaylistVisibility } from "@/types";
import { Lock, Plus, ListVideo, Youtube } from "lucide-react";
import { formatWatchTime } from "@/lib/utils";
import { toast } from "sonner";
import { QuickAddVideoDialog } from "@/components/video/QuickAddVideoDialog";
import { TagCategoryPicker } from "@/components/shared/TagCategoryPicker";
import { listCategories, listTags } from "@/lib/firestore/categoriesTags";
import { filterAndSortPersonalPlaylists, type PersonalPlaylistSort, type PersonalPlaylistVisibilityFilter } from "@/lib/playlistFilters";
import type { Category, Tag } from "@/types";
import { SearchableTagMultiSelect } from "@/components/shared/TagCategoryPicker";

const PERSONAL_PLAYLIST_VISIBILITY_LABELS: Record<PersonalPlaylistVisibility, string> = {
  private: "Private",
  link: "Anyone with link",
  public: "Public",
};

export default function MyPlaylistsPage() {
  return (
    <RequireAuth>
      <MyPlaylistsContent />
    </RequireAuth>
  );
}

function MyPlaylistsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Admins can pass ?owner=<uid> to browse/manage a specific student's
  // personal playlists from the Admin > User detail page. Otherwise this is
  // always "my own" playlists.
  const ownerId = searchParams.get("owner") || user?.uid || "";

  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<PersonalPlaylistVisibility>("private");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [saveVideoOpen, setSaveVideoOpen] = React.useState(false);
  const [query, setQuery] = React.useState(() => searchParams.get("q") || "");
  const [selectedCategory, setSelectedCategory] = React.useState(() => searchParams.get("category") || "all");
  const [selectedTags, setSelectedTags] = React.useState<string[]>(() => searchParams.getAll("tag"));
  const [sort, setSort] = React.useState<PersonalPlaylistSort>(() => (searchParams.get("sort") as PersonalPlaylistSort) || "recently-added");
  const [visibilityFilter, setVisibilityFilter] = React.useState<PersonalPlaylistVisibilityFilter>(() => (searchParams.get("visibility") as PersonalPlaylistVisibilityFilter) || "all");

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setPlaylists(await listPersonalPlaylists(ownerId));
    setLoading(false);
  }, [ownerId]);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    if (!ownerId) return;
    Promise.all([listCategories(ownerId), listTags()]).then(([nextCategories, nextTags]) => { setCategories(nextCategories); setTags(nextTags); }).catch(() => {});
  }, [ownerId]);
  React.useEffect(() => {
    if (searchParams.get("add") === "1") setSaveVideoOpen(true);
  }, [searchParams]);

  async function handleCreate() {
    if (!ownerId || !title.trim()) return;
    await createPersonalPlaylist(ownerId, title.trim(), description.trim(), visibility, categoryId, tagIds);
    setTitle(""); setDescription(""); setVisibility("private"); setCategoryId(null); setTagIds([]); setDialogOpen(false);
    toast.success("Playlist created");
    load();
  }

  React.useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string) => value && value !== "all" ? nextParams.set(key, value) : nextParams.delete(key);
    setOrDelete("q", query.trim());
    setOrDelete("category", selectedCategory);
    nextParams.delete("tag");
    selectedTags.forEach((tagId) => nextParams.append("tag", tagId));
    setOrDelete("sort", sort === "recently-added" ? "" : sort);
    setOrDelete("visibility", visibilityFilter);
    const nextUrl = nextParams.toString();
    if (nextUrl !== searchParams.toString()) router.replace(`${pathname}?${nextUrl}`, { scroll: false });
  }, [query, selectedCategory, selectedTags, sort, visibilityFilter, pathname, router, searchParams]);

  const isViewingOther = ownerId !== user?.uid;
  const filteredPlaylists = filterAndSortPersonalPlaylists(playlists, { query, categoryId: selectedCategory, tagIds: selectedTags, visibility: visibilityFilter, sort });
  const categoryCounts = categories.map((category) => ({ ...category, count: playlists.filter((playlist) => playlist.categoryId === category.id).length }));
  const tagCounts = tags.map((tag) => ({ ...tag, count: playlists.filter((playlist) => (playlist.tagIds || []).includes(tag.id)).length }));
  const representedCategories = new Set(playlists.map((playlist) => playlist.categoryId).filter(Boolean)).size;
  const representedTags = new Set(playlists.flatMap((playlist) => playlist.tagIds || [])).size;
  const hasFilters = !!query.trim() || selectedCategory !== "all" || selectedTags.length > 0 || visibilityFilter !== "all";
  const clearFilters = () => { setQuery(""); setSelectedCategory("all"); setSelectedTags([]); setVisibilityFilter("all"); setSort("recently-added"); };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5 text-accent" /> My Playlists
            </h1>
            <p className="text-sm text-muted-foreground">
              {isViewingOther
                ? "Managing this student's personal playlists as admin."
                : "Private to you — no other student can see these."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isViewingOther && <Button variant="outline" size="sm" onClick={() => setSaveVideoOpen(true)}><Plus className="h-4 w-4" /> Save Video</Button>}
            <Button asChild variant="outline" size="sm"><Link href="/playlists/import"><Youtube className="h-4 w-4" /> Import Playlist</Link></Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New Playlist</Button>
          </div>
        </div>

        {loading ? <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div> : <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-4"><SummaryStat label="Total playlists" value={playlists.length} /><SummaryStat label="Matching" value={filteredPlaylists.length} /><SummaryStat label="Categories used" value={representedCategories} /><SummaryStat label="Tags used" value={representedTags} /></div>}

        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-col gap-2 lg:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or description" className="flex-1" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}><SelectTrigger className="lg:w-52"><SelectValue placeholder="All categories" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categoryCounts.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} ({category.count})</SelectItem>)}</SelectContent></Select>
            <Select value={visibilityFilter} onValueChange={(value) => setVisibilityFilter(value as PersonalPlaylistVisibilityFilter)}><SelectTrigger className="lg:w-44"><SelectValue placeholder="All visibility" /></SelectTrigger><SelectContent><SelectItem value="all">All visibility</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="link">Anyone with link</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent></Select>
            <Select value={sort} onValueChange={(value) => setSort(value as PersonalPlaylistSort)}><SelectTrigger className="lg:w-48"><SelectValue placeholder="Sort" /></SelectTrigger><SelectContent><SelectItem value="recently-added">Recently added</SelectItem><SelectItem value="recently-updated">Recently updated</SelectItem><SelectItem value="title-asc">Title A-Z</SelectItem><SelectItem value="title-desc">Title Z-A</SelectItem><SelectItem value="most-videos">Most videos</SelectItem><SelectItem value="fewest-videos">Fewest videos</SelectItem></SelectContent></Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-sm font-medium">Tags</span>
            <SearchableTagMultiSelect tags={tagCounts} selectedTagIds={selectedTags} onChange={setSelectedTags} />
            {(hasFilters || sort !== "recently-added") && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
          </div>
        ) : playlists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
            No personal playlists yet. Create one to organize videos your own way.
          </p>
        ) : filteredPlaylists.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">No playlists match these filters. Try clearing one or more filters.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPlaylists.map((p) => (
              <Link key={p.id} href={`/playlists/${p.id}${isViewingOther ? `?owner=${ownerId}` : ""}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <ListVideo className="h-4 w-4 text-muted-foreground" />
                      <p className="truncate font-medium">{p.isUnsorted ? `Unsorted (${p.videoCount || 0})` : p.title}</p>
                    </div>
                    {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge variant="secondary">{p.videoCount} videos</Badge>
                      {!!p.totalDurationSeconds && <Badge variant="secondary">{formatWatchTime(p.totalDurationSeconds)}</Badge>}
                      <Badge variant="outline">{PERSONAL_PLAYLIST_VISIBILITY_LABELS[p.visibility] || "Private"}</Badge>
                      {p.categoryId && <Badge variant="outline">{categories.find((category) => category.id === p.categoryId)?.name || "Category"}</Badge>}
                      {(p.tagIds || []).map((tagId) => <Badge key={tagId} variant="outline">{tags.find((tag) => tag.id === tagId)?.name || "Tag"}</Badge>)}
                      {!p.categoryId && !(p.tagIds || []).length && <span className="text-xs text-muted-foreground">No category or tags</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {!isViewingOther && <QuickAddVideoDialog
        ownerId={ownerId}
        playlists={playlists}
        open={saveVideoOpen}
        onOpenChange={setSaveVideoOpen}
        onSaved={load}
      />}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Personal Playlist</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. My Interview Prep" />
            </div>
            {ownerId && <TagCategoryPicker userId={ownerId} categoryId={categoryId} tagIds={tagIds} onCategoryChange={setCategoryId} onTagsChange={setTagIds} />}
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(value) => setVisibility(value as PersonalPlaylistVisibility)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERSONAL_PLAYLIST_VISIBILITY_LABELS) as PersonalPlaylistVisibility[]).map((value) => (
                    <SelectItem key={value} value={value}>{PERSONAL_PLAYLIST_VISIBILITY_LABELS[value]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-display text-xl font-semibold">{value}</p></div>;
}
