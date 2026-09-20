"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TourChip } from "@/components/tour/TourChip";
import { PlaylistStackCard, type PlaylistCardAction } from "@/components/playlist/PlaylistStackCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPersonalPlaylist, deletePersonalPlaylist, listPersonalPlaylists, listPersonalVideos, recomputePlaylistSummary } from "@/lib/firestore/personalPlaylists";
import type { PersonalPlaylist, PersonalPlaylistVisibility } from "@/types";
import { LayoutGrid, List as ListIcon, ListVideo, Lock, Plus, Search, SlidersHorizontal, X, Youtube } from "lucide-react";
import { formatWatchTime } from "@/lib/utils";
import { toast } from "sonner";
import { QuickAddVideoDialog } from "@/components/video/QuickAddVideoDialog";
import { TagCategoryPicker } from "@/components/shared/TagCategoryPicker";
import { listCategories, listTags } from "@/lib/firestore/categoriesTags";
import { filterAndSortPersonalPlaylists, PERSONAL_PLAYLIST_SORT_LABELS, type PersonalPlaylistSort, type PersonalPlaylistVisibilityFilter } from "@/lib/playlistFilters";
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

  const [view, setView] = React.useState<"grid" | "list">(() => {
    const fromUrl = searchParams.get("view");
    if (fromUrl === "list" || fromUrl === "grid") return fromUrl;
    try { return window.localStorage.getItem("sl:playlists-view") === "list" ? "list" : "grid"; } catch { return "grid"; }
  });

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setPlaylists(await listPersonalPlaylists(ownerId));
    setLoading(false);
  }, [ownerId]);

  // Cards show cover/progress/"Continue" from a summary stored on each playlist doc, so the
  // list needs no per-video reads. Playlists created before summaries existed (or flagged stale
  // by an add/remove/watched write) are repaired here — at most 5 per visit, so a big library
  // can't burn the Firestore read quota in one page load. Opening a playlist repairs it too.
  const backfilled = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (loading || !user || ownerId !== user.uid) return;
    const targets = playlists
      .filter((p) => (p.videoCount || 0) > 0 && (!p.summary || p.summaryStale) && !backfilled.current.has(p.id))
      .slice(0, 5);
    if (targets.length === 0) return;
    targets.forEach((p) => backfilled.current.add(p.id));
    void (async () => {
      for (const p of targets) {
        try {
          const videos = await listPersonalVideos(ownerId, p.id);
          const summary = await recomputePlaylistSummary(ownerId, p, videos);
          setPlaylists((current) => current.map((x) => (x.id === p.id ? { ...x, summary, summaryStale: false } : x)));
        } catch { /* leave the plain card; the detail page will repair it */ }
      }
    })();
  }, [loading, playlists, user, ownerId]);

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
    setOrDelete("view", view === "list" ? "list" : "");
    const nextUrl = nextParams.toString();
    if (nextUrl !== searchParams.toString()) router.replace(`${pathname}?${nextUrl}`, { scroll: false });
  }, [query, selectedCategory, selectedTags, sort, visibilityFilter, view, pathname, router, searchParams]);

  const isViewingOther = ownerId !== user?.uid;
  const ownerQuery = isViewingOther ? `?owner=${ownerId}` : "";
  const sortedPlaylists = filterAndSortPersonalPlaylists(playlists, { query, categoryId: selectedCategory, tagIds: selectedTags, visibility: visibilityFilter, sort });
  // "Unsorted" is the inbox for videos saved without a playlist — keep it first, whatever the sort.
  const filteredPlaylists = [...sortedPlaylists.filter((p) => p.isUnsorted), ...sortedPlaylists.filter((p) => !p.isUnsorted)];
  const totalVideos = playlists.reduce((sum, p) => sum + (p.videoCount || 0), 0);
  const totalSeconds = playlists.reduce((sum, p) => sum + (p.totalDurationSeconds || 0), 0);
  const activeFilterCount = (selectedCategory !== "all" ? 1 : 0) + (visibilityFilter !== "all" ? 1 : 0) + selectedTags.length;

  function changeView(next: "grid" | "list") {
    setView(next);
    try { window.localStorage.setItem("sl:playlists-view", next); } catch { /* ignore */ }
  }

  async function handleCardAction(action: PlaylistCardAction, playlist: PersonalPlaylist) {
    if (action === "share" || action === "edit") {
      // Both flows already live on the detail page; open it with the matching dialog.
      router.push(`/playlists/${playlist.id}?${action === "share" ? "share=1" : "edit=1"}${ownerQuery ? `&owner=${ownerId}` : ""}`);
      return;
    }
    if (!confirm(`Delete "${playlist.title}" and all its videos? This can't be undone.`)) return;
    try {
      await deletePersonalPlaylist(ownerId, playlist.id);
      setPlaylists((current) => current.filter((p) => p.id !== playlist.id));
      toast.success("Playlist deleted");
    } catch (error: any) {
      toast.error(error?.message || "Unable to delete this playlist.");
    }
  }
  const categoryCounts = categories.map((category) => ({ ...category, count: playlists.filter((playlist) => playlist.categoryId === category.id).length }));
  const tagCounts = tags.map((tag) => ({ ...tag, count: playlists.filter((playlist) => (playlist.tagIds || []).includes(tag.id)).length }));
  const clearFilters = () => { setQuery(""); setSelectedCategory("all"); setSelectedTags([]); setVisibilityFilter("all"); setSort("recently-added"); };
  const categoryName = (id?: string | null) => (id ? categories.find((c) => c.id === id)?.name || null : null);
  const tagNamesFor = (ids?: string[]) => (ids || []).map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean) as string[];

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
              <Lock className="h-5 w-5 text-accent" /> My Playlists
            </h1>
            <p className="text-sm text-muted-foreground">
              {isViewingOther ? "Managing this student's personal playlists as admin." : "Private to you — no other student can see these."}
            </p>
            <TourChip tourId="playlists" className="mt-2" />
            {!loading && playlists.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                {playlists.length} playlist{playlists.length === 1 ? "" : "s"} · {totalVideos} video{totalVideos === 1 ? "" : "s"}
                {totalSeconds > 0 && <> · {formatWatchTime(totalSeconds)}</>}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!isViewingOther && <Button variant="outline" size="sm" onClick={() => setSaveVideoOpen(true)}><Plus className="h-4 w-4" /> Save Video</Button>}
            <Button asChild variant="outline" size="sm" data-tour="pl-import"><Link href="/playlists/import"><Youtube className="h-4 w-4" /> Import Playlist</Link></Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} data-tour="pl-new"><Plus className="h-4 w-4" /> New Playlist</Button>
          </div>
        </div>

        {/* Toolbar: search + sort stay visible; the rest lives in one Filters popover. */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1" data-tour="pl-search">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or description" className="pl-9" aria-label="Search playlists" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2" data-tour="pl-filters">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters
                    {activeFilterCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{activeFilterCount}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 space-y-4">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All categories</SelectItem>{categoryCounts.map((category) => <SelectItem key={category.id} value={category.id}>{category.name} ({category.count})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Visibility</Label>
                    <Select value={visibilityFilter} onValueChange={(value) => setVisibilityFilter(value as PersonalPlaylistVisibilityFilter)}>
                      <SelectTrigger><SelectValue placeholder="All visibility" /></SelectTrigger>
                      <SelectContent><SelectItem value="all">All visibility</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="link">Anyone with link</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tags</Label>
                    <SearchableTagMultiSelect tags={tagCounts} selectedTagIds={selectedTags} onChange={setSelectedTags} />
                  </div>
                  {activeFilterCount > 0 && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
                </PopoverContent>
              </Popover>
              <Select value={sort} onValueChange={(value) => setSort(value as PersonalPlaylistSort)}>
                <SelectTrigger className="w-44" aria-label="Sort playlists"><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERSONAL_PLAYLIST_SORT_LABELS) as PersonalPlaylistSort[]).map((key) => <SelectItem key={key} value={key}>{PERSONAL_PLAYLIST_SORT_LABELS[key]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Layout">
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => changeView("grid")} aria-label="Grid view" aria-pressed={view === "grid"}><LayoutGrid className="h-4 w-4" /></Button>
                <Button variant={view === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => changeView("list")} aria-label="List view" aria-pressed={view === "list"}><ListIcon className="h-4 w-4" /></Button>
              </div>
            </div>
          </div>

          {(activeFilterCount > 0 || query.trim()) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{filteredPlaylists.length} of {playlists.length} shown</span>
              {selectedCategory !== "all" && <FilterChip label={categoryName(selectedCategory) || "Category"} onRemove={() => setSelectedCategory("all")} />}
              {visibilityFilter !== "all" && <FilterChip label={PERSONAL_PLAYLIST_VISIBILITY_LABELS[visibilityFilter as PersonalPlaylistVisibility]} onRemove={() => setVisibilityFilter("all")} />}
              {selectedTags.map((tagId) => <FilterChip key={tagId} label={tags.find((t) => t.id === tagId)?.name || "Tag"} onRemove={() => setSelectedTags((current) => current.filter((id) => id !== tagId))} />)}
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
            </div>
          )}
        </div>

        {loading ? (
          view === "grid" ? (
            <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="mt-3 aspect-video w-full rounded-xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          )
        ) : playlists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <ListVideo className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold">Start your first playlist</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Group videos into a course, save a single link, or import a whole YouTube playlist. Progress is tracked for you.</p>
            {!isViewingOther && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New playlist</Button>
                <Button variant="outline" onClick={() => setSaveVideoOpen(true)}>Save a video</Button>
                <Button asChild variant="outline"><Link href="/playlists/import"><Youtube className="h-4 w-4" /> Import a playlist</Link></Button>
              </div>
            )}
          </div>
        ) : filteredPlaylists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">No playlists match these filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
          </div>
        ) : (
          <div className={view === "grid" ? "grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "space-y-3"}>
            {filteredPlaylists.map((p, index) => (
              <PlaylistStackCard
                key={p.id}
                playlist={p}
                href={`/playlists/${p.id}${ownerQuery}`}
                ownerQuery={ownerQuery}
                variant={view}
                priority={index < 4}
                categoryName={categoryName(p.categoryId)}
                tagNames={tagNamesFor(p.tagIds)}
                readOnly={isViewingOther}
                onAction={handleCardAction}
                tourAnchor={index === 0 ? "pl-first-card" : undefined}
              />
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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove filter ${label}`} className="rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
