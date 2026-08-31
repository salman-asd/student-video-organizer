"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ShareDialog } from "@/components/share/ShareDialog";
import { SortableList } from "@/components/dnd/SortableList";
import {
  addPersonalVideo, bulkRemovePersonalVideos, bulkSetPersonalVideosWatched, bulkSetPersonalVideoPriority,
  bulkTogglePersonalVideoFavorite, bulkTogglePersonalVideoWatchLater, bulkSetPersonalVideoDurations, deletePersonalPlaylist,
  findDuplicatePersonalVideoUrl, getPersonalPlaylist, listPersonalVideos, movePersonalVideo,
  removePersonalVideo, reorderPersonalVideos, renamePersonalPlaylist, setPersonalPlaylistSortMode,
  setPersonalPlaylistAutoPlay, setPersonalPlaylistSortKeywords, setPersonalVideoPriority, setPersonalVideoWatched,
  syncPersonalPlaylistTotalDuration, togglePersonalVideoFavorite, togglePersonalVideoWatchLater, updatePersonalVideoMeta,
} from "@/lib/firestore/personalPlaylists";
import { PlaylistVideoRow } from "@/components/video/PlaylistVideoRow";
import { db } from "@/lib/firebase";
import { createOrUpdatePlaylistShare } from "@/lib/firestore/shares";
import { getShareUrl } from "@/lib/sharing";
import { fetchVideoMetadata, type VideoMetadata } from "@/lib/video-metadata";
import {
  detectVideoProvider,
  extractExternalVideoId,
  normalizeVideoUrl,
  validateVideoUrl,
} from "@/lib/video-platforms";
import { formatDuration, formatWatchTime } from "@/lib/utils";
import { compareLessonPartPage } from "@/lib/lessonPartPageSort";
import { compareByKeywords, parseKeywordInput } from "@/lib/keywordSort";
import type { PersonalPlaylist, PersonalPlaylistSortMode, PersonalPlaylistVisibility, PersonalVideo, PriorityLevel, ShareVisibility } from "@/types";
import { ArrowLeft, CheckCircle2, Clock, Download, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PERSONAL_PLAYLIST_VISIBILITY_LABELS: Record<PersonalPlaylistVisibility, string> = {
  private: "Private",
  link: "Anyone with link",
  public: "Public",
};

const PERSONAL_PLAYLIST_SORT_LABELS: Record<PersonalPlaylistSortMode, string> = {
  custom: "Custom",
  newest: "Newest added",
  oldest: "Oldest added",
  "title-asc": "Title A-Z",
  "title-desc": "Title Z-A",
  "title-natural": "Title (numeric-aware)",
  "lesson-part-page": "Lesson → Part → Page",
  "advanced-keywords": "Advanced (custom keywords)",
  "watched-first": "Watched first",
  "unwatched-first": "Unwatched first",
  priority: "Priority",
  duration: "Duration",
};

// Plain title-asc does a character-by-character compare, so "Lesson 10"
// sorts before "Lesson 2" (the "1" beats the "2"). This treats embedded
// digit runs as numbers instead — "Lesson 2" then correctly comes before
// "Lesson 10" — which is what most numbered course/lesson titles need.
const naturalTitleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export default function PersonalPlaylistEditorPage() {
  return (
    <RequireAuth>
      <PersonalPlaylistEditorContent />
    </RequireAuth>
  );
}

function PersonalPlaylistEditorContent() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const ownerId = searchParams.get("owner") || user?.uid || "";
  const isViewingOther = ownerId !== user?.uid;

  const [playlist, setPlaylist] = React.useState<PersonalPlaylist | null>(null);
  const [videos, setVideos] = React.useState<PersonalVideo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addOpen, setAddOpen] = React.useState(false);  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PersonalVideo | null>(null);
  const [detailTitle, setDetailTitle] = React.useState("");
  const [detailDescription, setDetailDescription] = React.useState("");
  const [detailVisibility, setDetailVisibility] = React.useState<PersonalPlaylistVisibility>("private");
  const [sortMode, setSortMode] = React.useState<PersonalPlaylistSortMode>("custom");
  const [sortKeywords, setSortKeywords] = React.useState<string[]>([]);
  const [keywordDialogOpen, setKeywordDialogOpen] = React.useState(false);
  const [keywordDraft, setKeywordDraft] = React.useState("");
  const [isSorting, setIsSorting] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareVisibility, setShareVisibility] = React.useState<ShareVisibility>("private");
  const [shareUrl, setShareUrl] = React.useState("");
  const [shareBusy, setShareBusy] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filterMode, setFilterMode] = React.useState<"all" | "watched" | "unwatched" | "favorites" | "priority">("all");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  const [newUrl, setNewUrl] = React.useState("");
  const [newTitle, setNewTitle] = React.useState("");
  const [newThumb, setNewThumb] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [urlStatus, setUrlStatus] = React.useState<"idle" | "checking" | "valid" | "invalid" | "manual">("idle");
  const [metadataPreview, setMetadataPreview] = React.useState<VideoMetadata | null>(null);
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [p, vids] = await Promise.all([
      getPersonalPlaylist(ownerId, playlistId),
      listPersonalVideos(ownerId, playlistId),
    ]);
    setPlaylist(p);
    setVideos(vids);
    setLoading(false);
  }, [ownerId, playlistId]);

  React.useEffect(() => { load(); }, [load]);

  // Deep link from the Dashboard's "Add Video" button (?add=1) — opens the
  // Add Video dialog immediately instead of landing on a page with no
  // obvious next step.
  React.useEffect(() => {
    if (searchParams.get("add") === "1") setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!playlist) return;
    setDetailTitle(playlist.title);
    setDetailDescription(playlist.description || "");
    setDetailVisibility(playlist.visibility || "private");
    setSortMode(playlist.sortMode || "custom");
    setSortKeywords(playlist.sortKeywords || []);
  }, [playlist]);

  const sortedVideos = React.useMemo(() => {
    const source = [...videos];
    const customOrder = playlist?.sortOrder ?? [];
    if (sortMode === "custom") {
      const indexMap = new Map(customOrder.map((id, index) => [id, index]));
      const fallback = source.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return fallback.sort((a, b) => {
        const aIndex = indexMap.get(a.id);
        const bIndex = indexMap.get(b.id);
        if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
    }
    if (sortMode === "newest") return source.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
    if (sortMode === "oldest") return source.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    if (sortMode === "title-asc") return source.sort((a, b) => a.title.localeCompare(b.title));
    if (sortMode === "title-desc") return source.sort((a, b) => b.title.localeCompare(a.title));
    if (sortMode === "watched-first") return source.sort((a, b) => Number(b.status === "completed") - Number(a.status === "completed") || (a.order ?? 0) - (b.order ?? 0));
    if (sortMode === "unwatched-first") return source.sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || (a.order ?? 0) - (b.order ?? 0));
    if (sortMode === "priority") return source.sort((a, b) => {
      const priorityRank = { high: 3, medium: 2, low: 1, null: 0 } as const;
      const diff = (priorityRank[(b.priority ?? "null") as keyof typeof priorityRank] ?? 0) - (priorityRank[(a.priority ?? "null") as keyof typeof priorityRank] ?? 0);
      return diff || (a.order ?? 0) - (b.order ?? 0);
    });
    if (sortMode === "title-natural") return source.sort((a, b) => naturalTitleCollator.compare(a.title, b.title));
    if (sortMode === "lesson-part-page") return source.sort((a, b) => compareLessonPartPage(a.title, b.title));
    if (sortMode === "advanced-keywords") return source.sort((a, b) => compareByKeywords(a.title, b.title, sortKeywords));
    if (sortMode === "duration") return source.sort((a, b) => (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0));
    return source.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [videos, sortMode, sortKeywords, playlist?.sortOrder]);

  const filteredVideos = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedVideos.filter((video) => {
      const matchesQuery = !query || video.title.toLowerCase().includes(query) || video.videoUrl.toLowerCase().includes(query);
      const matchesFilter = (() => {
        if (filterMode === "watched") return video.status === "completed";
        if (filterMode === "unwatched") return video.status !== "completed";
        if (filterMode === "favorites") return !!video.isFavorite;
        if (filterMode === "priority") return !!video.priority;
        return true;
      })();
      return matchesQuery && matchesFilter;
    });
  }, [sortedVideos, searchQuery, filterMode]);

  const watchedCount = videos.filter((video) => video.status === "completed").length;
  const unwatchedCount = videos.length - watchedCount;
  const completionPercent = videos.length > 0 ? Math.round((watchedCount / videos.length) * 100) : 0;
  const totalDurationSeconds = React.useMemo(
    () => videos.reduce((sum, v) => sum + (v.durationSeconds || 0), 0),
    [videos]
  );

  // Self-heals the playlist's stored total (used by the /my-playlists card
  // list) against whatever's actually true right now — covers playlists
  // whose videos/durations existed before this running total did, without
  // a one-time migration script. Cheap: one write, only when it's wrong.
  React.useEffect(() => {
    if (!playlist || loading) return;
    if ((playlist.totalDurationSeconds || 0) !== totalDurationSeconds) {
      syncPersonalPlaylistTotalDuration(ownerId, playlistId, totalDurationSeconds)
        .then(() => setPlaylist((p) => (p ? { ...p, totalDurationSeconds } : p)))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalDurationSeconds]);
  const firstThumb = videos.find((v) => !!v.thumbnailUrl)?.thumbnailUrl || "";
  const selectedVideos = videos.filter((video) => selectedIds.includes(video.id));
  const allVisibleSelected = filteredVideos.length > 0 && filteredVideos.every((video) => selectedIds.includes(video.id));
  const allSelectedWatched = selectedVideos.length > 0 && selectedVideos.every((video) => video.status === "completed");

  React.useEffect(() => {
    let isActive = true;

    if (!newUrl.trim()) {
      setMetadataPreview(null);
      setUrlStatus("idle");
      setUrlError(null);
      return;
    }

    const candidate = newUrl.trim();
    const provider = detectVideoProvider(candidate);

    if (!provider || !validateVideoUrl(candidate)) {
      setUrlStatus("invalid");
      setUrlError("That URL could not be validated as a supported video link.");
      setMetadataPreview(null);
      return;
    }

    setUrlStatus("checking");
    setUrlError(null);

    // Only Facebook's metadata lookup needs an auth token (it goes through
    // /api/facebook-video, a Graph API call that must run server-side —
    // see video-metadata.ts). Fetching it unconditionally here is harmless
    // for YouTube/Vimeo since fetchVideoMetadata simply ignores it for
    // those platforms.
    Promise.resolve(user?.getIdToken?.())
      .catch(() => null)
      .then((idToken) => fetchVideoMetadata(candidate, { idToken }))
      .then((meta) => {
        if (!isActive) return;
        if (meta) {
          setMetadataPreview(meta);
          setUrlStatus("valid");
          setNewTitle((current) => current || meta.title);
          setNewThumb((current) => current || (meta.thumbnailUrl || ""));
          setNewDescription((current) => current || (meta.description || ""));

          // oEmbed (used above) never returns duration for YouTube — only
          // the Data API does, which needs a server round-trip. Fetched
          // separately so it doesn't delay the rest of the preview.
          if (meta.durationSeconds == null && (meta.platform === "youtube" || meta.platform === "youtube-shorts")) {
            const ytId = extractExternalVideoId(candidate);
            if (ytId) {
              user?.getIdToken?.().then((idToken) =>
                fetch(`/api/youtube-duration?ids=${encodeURIComponent(ytId)}`, {
                  headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
                }).then((res) => (res.ok ? res.json() : null))
              ).then((data) => {
                const seconds = data?.durations?.[ytId];
                if (isActive && typeof seconds === "number") {
                  setMetadataPreview((current) => (current ? { ...current, durationSeconds: seconds } : current));
                }
              }).catch(() => {});
            }
          }
        } else {
          setMetadataPreview(null);
          setUrlStatus("manual");
          setUrlError("Metadata could not be fetched automatically, but you can still save this URL manually.");
        }
      })
      .catch(() => {
        if (!isActive) return;
        setMetadataPreview(null);
        setUrlStatus("manual");
        setUrlError("Metadata could not be fetched automatically, but you can still save this URL manually.");
      });

    return () => { isActive = false; };
    // `user` is intentionally omitted — this only needs the *current*
    // getIdToken() at fetch time, and adding user as a dependency would
    // re-run the whole metadata fetch on token refresh, not just when the
    // URL changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newUrl]);

  async function handleReorder(newOrder: PersonalVideo[]) {
    if (sortMode !== "custom") return;
    // `newOrder` is only the currently visible (searched/filtered) subset —
    // SortableList never sees videos hidden by the search box or the
    // Filter dropdown. Splicing that subset's new relative order back into
    // the *positions it already occupied* in the full list preserves every
    // other video instead of silently dropping it from the playlist.
    const visibleIds = new Set(newOrder.map((v) => v.id));
    const positions = videos.reduce<number[]>((acc, v, i) => {
      if (visibleIds.has(v.id)) acc.push(i);
      return acc;
    }, []);
    const merged = [...videos];
    positions.forEach((pos, i) => { merged[pos] = newOrder[i]; });

    setVideos(merged);
    // sortedVideos (custom mode) derives its order from playlist.sortOrder,
    // not from the videos array's own order — without also updating this
    // local copy, the drag would visually "snap back" until the next full
    // reload re-fetched the playlist doc with its now-persisted sortOrder.
    setPlaylist((p) => (p ? { ...p, sortOrder: merged.map((v) => v.id) } : p));
    setIsSorting(true);
    await reorderPersonalVideos(ownerId, playlistId, merged.map((v) => v.id));
    setIsSorting(false);
  }

  const handleMoveVideo = async (videoId: string, direction: "up" | "down") => {
    if (sortMode !== "custom") return;
    const currentIndex = videos.findIndex((video) => video.id === videoId);
    if (currentIndex === -1) return;

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= videos.length) return;

    const updated = [...videos];
    const [moved] = updated.splice(currentIndex, 1);
    updated.splice(nextIndex, 0, moved);
    setVideos(updated);
    setPlaylist((p) => (p ? { ...p, sortOrder: updated.map((v) => v.id) } : p));
    setIsSorting(true);
    await movePersonalVideo(ownerId, playlistId, videoId, direction);
    setIsSorting(false);
  };

  const missingDurationCount = React.useMemo(
    () => videos.filter((v) => !v.durationSeconds && v.youtubeVideoId).length,
    [videos]
  );

  // Backfills duration for videos saved before this app could fetch it
  // (oEmbed / playlistItems never return duration — only a separate,
  // batched Data API call does). Safe to run repeatedly; only touches
  // videos currently missing a duration.
  const [fixingDurations, setFixingDurations] = React.useState(false);
  async function handleFixMissingDurations() {
    const missing = videos.filter((v) => !v.durationSeconds && v.youtubeVideoId);
    if (missing.length === 0) {
      toast.success("Every video already has a duration.");
      return;
    }
    setFixingDurations(true);
    try {
      const idToken = await user?.getIdToken?.();
      const durations: Record<string, number> = {};
      let lastError: string | null = null;
      for (let start = 0; start < missing.length; start += 50) {
        const batch = missing.slice(start, start + 50);
        const ids = batch.map((v) => v.youtubeVideoId as string).join(",");
        const res = await fetch(`/api/youtube-duration?ids=${encodeURIComponent(ids)}`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          lastError = data?.error || `Request failed (${res.status})`;
          continue;
        }
        Object.assign(durations, data?.durations || {});
        if (data?.error) lastError = data.error;
      }

      // durations is keyed by YouTube video ID, not our Firestore video doc
      // ID — map back to doc IDs before writing.
      const byDocId: Record<string, number> = {};
      missing.forEach((v) => {
        if (v.youtubeVideoId && durations[v.youtubeVideoId] !== undefined) byDocId[v.id] = durations[v.youtubeVideoId];
      });

      const fixedCount = Object.keys(byDocId).length;
      if (fixedCount === 0) {
        toast.error(lastError ? `Couldn't fetch durations: ${lastError}` : "Couldn't fetch durations — check that YOUTUBE_API_KEY is configured.");
        return;
      }

      await bulkSetPersonalVideoDurations(ownerId, playlistId, byDocId);
      setVideos((current) => current.map((v) => (byDocId[v.id] !== undefined ? { ...v, durationSeconds: byDocId[v.id] } : v)));
      const skipped = missing.length - fixedCount;
      toast.success(`Fixed duration for ${fixedCount} of ${missing.length} video${missing.length === 1 ? "" : "s"}.${skipped > 0 && lastError ? ` ${skipped} skipped: ${lastError}` : ""}`);
    } finally {
      setFixingDurations(false);
    }
  }

  async function handleAddVideo() {
    const candidate = newUrl.trim();
    if (!candidate) {
      setUrlError("Paste a video URL first.");
      return;
    }

    if (!validateVideoUrl(candidate)) {
      setUrlError("That URL is not valid for a supported video platform.");
      return;
    }

    const duplicate = await findDuplicatePersonalVideoUrl(ownerId, playlistId, candidate);
    if (duplicate) {
      setUrlError("This video is already in this playlist.");
      return;
    }

    const title = newTitle.trim() || metadataPreview?.title || "Untitled video";
    const normalized = normalizeVideoUrl(candidate) ?? { canonicalUrl: candidate, originalWatchUrl: candidate, externalVideoId: extractExternalVideoId(candidate), embedUrl: null, platform: detectVideoProvider(candidate)?.platform || "generic" };
    // Short Facebook share links (fb.watch, /share/v/) normalize client-side
    // to the raw pasted URL, since resolving them needs a server round trip
    // — but if the metadata fetch already resolved one (see
    // video-metadata.ts's Facebook branch), prefer that clean, ID-bearing
    // URL over the short link so what's actually stored is the canonical
    // https://www.facebook.com/watch/?v=... form.
    const resolvedVideoUrl = metadataPreview?.canonicalUrl || normalized.canonicalUrl || candidate;

    setSaveLoading(true);
    try {
      await addPersonalVideo(ownerId, playlistId, {
        title,
        videoUrl: resolvedVideoUrl,
        youtubeVideoId: normalized.externalVideoId,
        thumbnailUrl: newThumb.trim() || metadataPreview?.thumbnailUrl || "",
        durationSeconds: metadataPreview?.durationSeconds ?? undefined,
        description: newDescription.trim() || metadataPreview?.description || null,
        creator: metadataPreview?.creator || null,
        publishedAt: metadataPreview?.publishedAt || null,
        platform: normalized.platform,
      });
      setNewUrl(""); setNewTitle(""); setNewThumb(""); setNewDescription(""); setMetadataPreview(null); setUrlStatus("idle"); setUrlError(null); setAddOpen(false);
      toast.success("Video added");
      load();
    } catch (error: any) {
      setUrlError(error?.message || "Unable to save this video.");
      toast.error(error?.message || "Unable to save this video.");
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleSaveEdit() {
    if (!editing) return;
    await updatePersonalVideoMeta(ownerId, playlistId, editing.id, {
      title: editing.title, videoUrl: editing.videoUrl, thumbnailUrl: editing.thumbnailUrl,
    });
    setEditing(null);
    toast.success("Video updated");
    load();
  }

  async function handleSortModeChange(nextMode: PersonalPlaylistSortMode) {
    if (!playlist) return;

    // "Advanced" needs to know WHICH keywords to sort by first, so it opens
    // a dialog instead of applying immediately. If keywords were already
    // chosen before (re-selecting the mode), just re-apply them.
    if (nextMode === "advanced-keywords") {
      if (sortKeywords.length > 0) {
        setSortMode(nextMode);
        await setPersonalPlaylistSortMode(ownerId, playlistId, nextMode);
        setVideos((current) => [...current].sort((a, b) => compareByKeywords(a.title, b.title, sortKeywords)));
        return;
      }
      setKeywordDraft("");
      setKeywordDialogOpen(true);
      return;
    }

    setSortMode(nextMode);
    await setPersonalPlaylistSortMode(ownerId, playlistId, nextMode);
    if (nextMode === "custom") {
      const ordered = [...videos].sort((a, b) => {
        const order = playlist.sortOrder ?? [];
        const aIndex = order.indexOf(a.id);
        const bIndex = order.indexOf(b.id);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return (a.order ?? 0) - (b.order ?? 0);
      });
      setVideos(ordered);
      return;
    }

    const sorted = [...videos].sort((a, b) => {
      if (nextMode === "newest") return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
      if (nextMode === "oldest") return (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);
      if (nextMode === "title-asc") return a.title.localeCompare(b.title);
      if (nextMode === "title-desc") return b.title.localeCompare(a.title);
      if (nextMode === "watched-first") return Number(b.status === "completed") - Number(a.status === "completed") || (a.order ?? 0) - (b.order ?? 0);
      if (nextMode === "unwatched-first") return Number(a.status === "completed") - Number(b.status === "completed") || (a.order ?? 0) - (b.order ?? 0);
      if (nextMode === "priority") {
        const priorityRank = { high: 3, medium: 2, low: 1, null: 0 } as const;
        return ((priorityRank[(b.priority ?? "null") as keyof typeof priorityRank] ?? 0) - (priorityRank[(a.priority ?? "null") as keyof typeof priorityRank] ?? 0)) || (a.order ?? 0) - (b.order ?? 0);
      }
      if (nextMode === "duration") return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
      if (nextMode === "title-natural") return naturalTitleCollator.compare(a.title, b.title);
      if (nextMode === "lesson-part-page") return compareLessonPartPage(a.title, b.title);
      return (a.order ?? 0) - (b.order ?? 0);
    });
    setVideos(sorted);
  }

  // Applies (and persists) the keyword list entered in the "Advanced sort"
  // dialog — used both the first time a playlist switches into
  // advanced-keywords mode and whenever the user reopens the dialog to
  // change the keywords later.
  async function handleApplyKeywordSort() {
    if (!playlist) return;
    const keywords = parseKeywordInput(keywordDraft);
    if (keywords.length === 0) {
      toast.error("Enter at least one keyword to sort by");
      return;
    }
    setSortKeywords(keywords);
    setSortMode("advanced-keywords");
    setKeywordDialogOpen(false);
    await setPersonalPlaylistSortKeywords(ownerId, playlistId, keywords);
    setVideos((current) => [...current].sort((a, b) => compareByKeywords(a.title, b.title, keywords)));
    toast.success(`Sorted by ${keywords.join(" → ")}`);
  }

  // Lets a big bulk reorder (e.g. "sort ~165 videos by their Lesson/Part
  // number") happen in one click instead of drag-and-dropping every video:
  // pick a temporary sort mode, eyeball that it looks right, then persist
  // whatever order is currently on screen as the new Custom order.
  async function handleSaveAsCustomOrder() {
    if (!playlist || sortMode === "custom") return;
    const ids = videos.map((v) => v.id);
    setIsSorting(true);
    try {
      await reorderPersonalVideos(ownerId, playlistId, ids);
      await setPersonalPlaylistSortMode(ownerId, playlistId, "custom");
      setPlaylist((p) => (p ? { ...p, sortOrder: ids, sortMode: "custom" } : p));
      setSortMode("custom");
      toast.success("Saved this order as the playlist's Custom order");
    } finally {
      setIsSorting(false);
    }
  }

  // Per-row quick actions — previously these states could only be set in
  // bulk (via multi-select) or from inside a video's own detail page; the
  // redesigned row exposes them directly so a single toggle doesn't need
  // either of those detours.
  async function handleRowToggleFavorite(v: PersonalVideo) {
    const next = !v.isFavorite;
    setVideos((current) => current.map((video) => (video.id === v.id ? { ...video, isFavorite: next } : video)));
    await togglePersonalVideoFavorite(ownerId, playlistId, v.id, next);
  }

  async function handleRowToggleWatchLater(v: PersonalVideo) {
    const next = !v.isWatchLater;
    setVideos((current) => current.map((video) => (video.id === v.id ? { ...video, isWatchLater: next } : video)));
    await togglePersonalVideoWatchLater(ownerId, playlistId, v.id, next);
  }

  async function handleRowSetPriority(v: PersonalVideo, priority: PriorityLevel) {
    setVideos((current) => current.map((video) => (video.id === v.id ? { ...video, priority } : video)));
    await setPersonalVideoPriority(ownerId, playlistId, v.id, priority);
  }

  async function handleRowToggleWatched(v: PersonalVideo) {
    const next = v.status !== "completed";
    setVideos((current) => current.map((video) => (
      video.id === v.id ? { ...video, status: next ? "completed" : "not_started", watchedPercentage: next ? 100 : 0 } : video
    )));
    await setPersonalVideoWatched(ownerId, playlistId, v.id, next);
  }

  async function handleToggleAutoPlay(checked: boolean) {
    setPlaylist((p) => (p ? { ...p, autoPlay: checked } : p));
    await setPersonalPlaylistAutoPlay(ownerId, playlistId, checked);
    toast.success(checked ? "Autoplay turned on for this playlist" : "Autoplay turned off");
  }

  async function handleSavePlaylistDetails() {
    if (!playlist) return;
    await renamePersonalPlaylist(
      ownerId,
      playlistId,
      detailTitle.trim() || "Untitled playlist",
      detailDescription.trim(),
      detailVisibility,
    );
    setDetailsOpen(false);
    toast.success("Playlist updated");
    load();
  }

  async function handleRemove(v: PersonalVideo) {
    if (!confirm(`Remove "${v.title}" from this playlist?`)) return;
    await removePersonalVideo(ownerId, playlistId, v.id);
    toast.success("Video removed");
    load();
  }

  async function handleDeletePlaylist() {
    if (!confirm(`Delete "${playlist?.title}" and all its videos? This can't be undone.`)) return;
    await deletePersonalPlaylist(ownerId, playlistId);
    toast.success("Playlist deleted");
    window.location.href = isViewingOther ? `/my-playlists?owner=${ownerId}` : "/my-playlists";
  }

  const handleSharePlaylist = async () => {
    if (!user || !playlist) return;
    setShareBusy(true);
    try {
      const record = await createOrUpdatePlaylistShare(user.uid, playlist, videos.map((v) => ({
        id: v.id,
        title: v.title,
        videoUrl: v.videoUrl,
        thumbnailUrl: v.thumbnailUrl,
        durationSeconds: v.durationSeconds,
        platform: v.platform,
      })), "private");
      setShareVisibility(record.visibility || "private");
      setShareUrl(getShareUrl(record.shareToken, "playlist"));
      setShareOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Unable to prepare this playlist share.");
    } finally {
      setShareBusy(false);
    }
  };

  const handleShareVisibilityChange = async (next: ShareVisibility) => {
    if (!user || !playlist) return;
    const record = await createOrUpdatePlaylistShare(user.uid, playlist, videos.map((v) => ({
      id: v.id,
      title: v.title,
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl,
      durationSeconds: v.durationSeconds,
      platform: v.platform,
    })), next);
    setShareVisibility(record.visibility || "private");
    setShareUrl(getShareUrl(record.shareToken, "playlist"));
    toast.success(`Playlist sharing updated to ${next === "unlisted" ? "Anyone with link" : next === "public" ? "Public" : "Private"}.`);
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied");
  };

  const handleRevokeShare = async () => {
    if (!user || !playlist) return;
    const record = await createOrUpdatePlaylistShare(user.uid, playlist, videos.map((v) => ({
      id: v.id,
      title: v.title,
      videoUrl: v.videoUrl,
      thumbnailUrl: v.thumbnailUrl,
      durationSeconds: v.durationSeconds,
      platform: v.platform,
    })), "private", true);
    setShareVisibility("private");
    setShareUrl(record.shareToken ? getShareUrl(record.shareToken, "playlist") : "");
    setShareOpen(false);
    toast.success("Playlist sharing revoked");
  };

  const backHref = isViewingOther ? `/my-playlists?owner=${ownerId}` : "/my-playlists";

  const handleBulkDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Remove ${selectedIds.length} selected video${selectedIds.length > 1 ? "s" : ""} from this playlist?`)) return;
    await bulkRemovePersonalVideos(ownerId, playlistId, selectedIds);
    setSelectedIds([]);
    await load();
  };

  const handleBulkMarkWatched = async () => {
    if (selectedVideos.length === 0) return;
    const nextValue = allSelectedWatched ? false : true;
    await bulkSetPersonalVideosWatched(ownerId, playlistId, selectedIds, nextValue);
    setSelectedIds([]);
    await load();
  };

  const handleBulkToggleFavorite = async (value: boolean) => {
    if (selectedIds.length === 0) return;
    await bulkTogglePersonalVideoFavorite(ownerId, playlistId, selectedIds, value);
    setSelectedIds([]);
    await load();
  };

  const handleBulkWatchLater = async (value: boolean) => {
    if (selectedIds.length === 0) return;
    await bulkTogglePersonalVideoWatchLater(ownerId, playlistId, selectedIds, value);
    setSelectedIds([]);
    await load();
  };

  const handleBulkSetPriority = async (value: "high" | "medium" | "low" | null) => {
    if (selectedIds.length === 0) return;
    await bulkSetPersonalVideoPriority(ownerId, playlistId, selectedIds, value);
    setSelectedIds([]);
    await load();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to {isViewingOther ? "Their Playlists" : "My Playlists"}
        </Link>

        {loading ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div className="grid gap-0 md:grid-cols-[220px_1fr]">
              <div className="relative h-44 w-full overflow-hidden bg-secondary md:h-full">
                {firstThumb ? (
                  <Image src={firstThumb} alt={playlist?.title || "Playlist thumbnail"} fill className="object-cover" sizes="(max-width: 768px) 100vw, 220px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">No thumbnail</div>
                )}
              </div>

              <div className="space-y-4 p-4 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <Badge variant="secondary">{playlist ? PERSONAL_PLAYLIST_VISIBILITY_LABELS[playlist.visibility] : "Private"}</Badge>
                    <h1 className="font-display text-2xl font-semibold leading-tight">{playlist?.title}</h1>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add Video</Button>
                    <Button variant="outline" size="sm" asChild><Link href={`/my-playlists/import?target=${playlistId}`}><Download className="h-4 w-4" /> Import Playlist</Link></Button>
                    {missingDurationCount > 0 && (
                      <Button variant="outline" size="sm" onClick={handleFixMissingDurations} disabled={fixingDurations}>
                        <Clock className="h-4 w-4" /> {fixingDurations ? "Fixing durations…" : `Fix ${missingDurationCount} missing durations`}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={handleSharePlaylist} disabled={shareBusy}>Share</Button>
                    <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                    <Button variant="destructive" size="sm" onClick={handleDeletePlaylist}><Trash2 className="h-4 w-4" /> Delete</Button>
                  </div>
                </div>

                {playlist?.description && <p className="text-sm leading-6 text-muted-foreground">{playlist.description}</p>}

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>{videos.length} videos</span>
                  <span>{watchedCount} watched</span>
                  <span>{unwatchedCount} unwatched</span>
                  {totalDurationSeconds > 0 && <span>{formatWatchTime(totalDurationSeconds)} total</span>}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{completionPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completionPercent}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && (
          // Sticky within <main>'s own scroll region (see AppShell): search,
          // filter, sort, and autoplay stay reachable no matter how far
          // down a long video list you've scrolled, without needing a
          // second nested scrollbar. The hero card above (thumbnail,
          // description, stats) intentionally scrolls away normally —
          // those are one-glance details, not controls you need mid-scroll.
          <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search within playlist" className="pl-9" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground">Filter</label>
                <Select value={filterMode} onValueChange={(value) => setFilterMode(value as typeof filterMode)}>
                  <SelectTrigger className="h-9 w-[170px]">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="watched">Watched</SelectItem>
                    <SelectItem value="unwatched">Unwatched</SelectItem>
                    <SelectItem value="favorites">Favorites</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                  </SelectContent>
                </Select>

                <label className="text-xs text-muted-foreground">Sort</label>
                <Select value={sortMode} onValueChange={(value) => handleSortModeChange(value as PersonalPlaylistSortMode)}>
                  <SelectTrigger className="h-9 w-[180px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERSONAL_PLAYLIST_SORT_LABELS) as PersonalPlaylistSortMode[]).map((mode) => (
                      <SelectItem key={mode} value={mode}>{PERSONAL_PLAYLIST_SORT_LABELS[mode]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2 border-l border-border pl-2.5">
                  <label htmlFor="autoplay-toggle" className="text-xs text-muted-foreground">Autoplay</label>
                  <Switch id="autoplay-toggle" checked={!!playlist?.autoPlay} onCheckedChange={handleToggleAutoPlay} aria-label="Auto-play next video" />
                </div>
              </div>
            </div>

            {sortMode !== "custom" && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {sortMode === "advanced-keywords" && sortKeywords.length > 0 && (
                    <>Sorting by <strong>{sortKeywords.join(" → ")}</strong>. </>
                  )}
                  Drag-to-reorder is only available in <strong>Custom</strong> sort. Looks right? Save it instead of dragging every video.
                </p>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {sortMode === "advanced-keywords" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setKeywordDraft(sortKeywords.join(", "));
                        setKeywordDialogOpen(true);
                      }}
                    >
                      Edit keywords
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleSaveAsCustomOrder} disabled={isSorting}>
                    Save this order as Custom
                  </Button>
                </div>
              </div>
            )}

            {selectedIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2">
                <span className="text-sm font-medium">{selectedIds.length} selected</span>
                <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
                <Button variant="outline" size="sm" onClick={handleBulkMarkWatched}><CheckCircle2 className="h-4 w-4" /> {allSelectedWatched ? "Mark unwatched" : "Mark watched"}</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkToggleFavorite(true)}>Favorite</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkToggleFavorite(false)}>Unfavorite</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkWatchLater(true)}>Add to Watch Later</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkWatchLater(false)}>Remove from Watch Later</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkSetPriority("high")}>High</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkSetPriority("medium")}>Medium</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkSetPriority("low")}>Low</Button>
                <Button variant="outline" size="sm" onClick={() => handleBulkSetPriority(null)}>Clear priority</Button>
                <Button variant="destructive" size="sm" onClick={handleBulkDeleteSelected}>Delete selected</Button>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
        ) : filteredVideos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">No matching videos in this playlist.</p>
        ) : (
          <SortableList
            items={filteredVideos}
            getId={(v) => v.id}
            onReorder={(newOrder) => {
              setSelectedIds([]);
              handleReorder(newOrder);
            }}
            className="space-y-1.5"
            renderItem={(v, dragHandleProps, index) => (
              <PlaylistVideoRow
                video={v}
                watchHref={`/my-playlists/${playlistId}/${v.id}${isViewingOther ? `?owner=${ownerId}` : ""}`}
                selected={selectedIds.includes(v.id)}
                onToggleSelect={() => toggleSelect(v.id)}
                dragHandleProps={dragHandleProps}
                canDrag={sortMode === "custom"}
                isSorting={isSorting}
                canMoveUp={sortMode === "custom" && index > 0}
                canMoveDown={sortMode === "custom" && index < filteredVideos.length - 1}
                onMoveUp={() => handleMoveVideo(v.id, "up")}
                onMoveDown={() => handleMoveVideo(v.id, "down")}
                onEdit={() => setEditing(v)}
                onRemove={() => handleRemove(v)}
                onToggleFavorite={() => handleRowToggleFavorite(v)}
                onToggleWatchLater={() => handleRowToggleWatchLater(v)}
                onSetPriority={(p) => handleRowSetPriority(v, p)}
                onToggleWatched={() => handleRowToggleWatched(v)}
              />
            )}
          />
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={(open) => {
        setAddOpen(open);
        if (!open) {
          setNewUrl("");
          setNewTitle("");
          setNewThumb("");
          setNewDescription("");
          setMetadataPreview(null);
          setUrlStatus("idle");
          setUrlError(null);
          setSaveLoading(false);
        }
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Add Video</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Video URL</Label>
              <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              {urlStatus === "checking" && <p className="text-xs text-muted-foreground">Checking this video…</p>}
              {urlStatus === "valid" && metadataPreview && <p className="text-xs text-emerald-600">Metadata detected successfully.</p>}
              {urlStatus === "manual" && <p className="text-xs text-amber-600">Metadata unavailable; you can still save manually.</p>}
              {urlError && <p className="text-xs text-destructive">{urlError}</p>}
            </div>

            {metadataPreview && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <div className="flex gap-3">
                  {metadataPreview.thumbnailUrl && (
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-secondary">
                      <Image src={metadataPreview.thumbnailUrl} alt={metadataPreview.title} fill className="object-cover" sizes="128px" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-foreground">{metadataPreview.title}</p>
                    {metadataPreview.creator && <p className="text-xs text-muted-foreground">By {metadataPreview.creator}</p>}
                    {metadataPreview.durationSeconds && <p className="text-xs text-muted-foreground">Duration: {formatDuration(metadataPreview.durationSeconds)}</p>}
                    {metadataPreview.description && <p className="line-clamp-3 text-xs text-muted-foreground">{metadataPreview.description}</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Video title" />
            </div>

            <div className="space-y-1.5">
              <Label>Thumbnail URL</Label>
              <Input value={newThumb} onChange={(e) => setNewThumb(e.target.value)} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional notes for this video"
                className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddVideo} disabled={saveLoading || urlStatus === "checking" || !newUrl.trim()}>
              {saveLoading ? "Saving…" : "Save video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Playlist Details</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={detailTitle} onChange={(e) => setDetailTitle(e.target.value)} placeholder="Playlist title" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                value={detailDescription}
                onChange={(e) => setDetailDescription(e.target.value)}
                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Optional playlist description"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select value={detailVisibility} onValueChange={(value) => setDetailVisibility(value as PersonalPlaylistVisibility)}>
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
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePlaylistDetails}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Video</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Video URL</Label>
                <Input value={editing.videoUrl} onChange={(e) => setEditing({ ...editing, videoUrl: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Thumbnail URL</Label>
                <Input value={editing.thumbnailUrl} onChange={(e) => setEditing({ ...editing, thumbnailUrl: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={keywordDialogOpen}
        onOpenChange={(open) => {
          setKeywordDialogOpen(open);
          // Cancelling before ever choosing keywords shouldn't leave the
          // dropdown stuck on "Advanced" with nothing to actually sort by.
          if (!open && sortKeywords.length === 0 && sortMode === "advanced-keywords") {
            setSortMode("custom");
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>Advanced sort — sort by keywords</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Type the words that appear in this playlist&apos;s video titles, in priority order. For titles
              like <em>&quot;Chapter 3 - Unit 2&quot;</em>, enter <strong>Chapter, Unit</strong> — videos are grouped by the
              Chapter number first, then by Unit number as a tiebreaker. Titles with no match are placed
              alphabetically at the end.
            </p>
            <div className="space-y-1.5">
              <Label>Keywords, in priority order (comma-separated)</Label>
              <Input
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                placeholder="e.g. Chapter, Unit, Page"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyKeywordSort();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKeywordDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyKeywordSort}>Apply sort</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ShareDialog
        open={shareOpen}
        onOpenChange={(open) => {
          setShareOpen(open);
          if (!open) {
            setShareUrl("");
          }
        }}
        shareUrl={shareUrl}
        visibility={shareVisibility}
        onVisibilityChange={handleShareVisibilityChange}
        onCopy={handleCopyShareLink}
        onRevoke={handleRevokeShare}
        loading={shareBusy}
      />
    </AppShell>
  );
}
