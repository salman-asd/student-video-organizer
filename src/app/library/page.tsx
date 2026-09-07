"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { VideoGrid } from "@/components/video/VideoGrid";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { listAllPersonalVideos } from "@/lib/firestore/personalPlaylists";
import { listSharesForRecipient } from "@/lib/firestore/shares";
import { getAllUserVideoStates } from "@/lib/firestore/userVideoState";
import { personalVideoToVideoWithState } from "@/lib/personalVideoAdapter";
import { applySort } from "@/lib/filterSort";
import type { ShareRecord, SortOption, VideoPlatform, VideoWithState } from "@/types";
import { VIDEO_PLATFORMS } from "@/types";

type DiscoverySource = "personal" | "shared";
const SOURCE_LABELS: Record<DiscoverySource, string> = { personal: "Your Playlists", shared: "Shared to me" };

export default function LibraryPage() {
  return <RequireAuth><LibraryContent /></RequireAuth>;
}

function LibraryContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [videos, setVideos] = React.useState<VideoWithState[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOption>("recently-added");
  const [platform, setPlatform] = React.useState<VideoPlatform | "all">("all");
  const [categoryId, setCategoryId] = React.useState(searchParams.get("category") || "all");
  const [tagId, setTagId] = React.useState("all");
  const [sources, setSources] = React.useState<Record<DiscoverySource, boolean>>({ personal: true, shared: true });

  React.useEffect(() => {
    const category = searchParams.get("category");
    if (category) setCategoryId(category);
  }, [searchParams]);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [personalVideos, acceptedShares, states] = await Promise.all([
        listAllPersonalVideos(user.uid), listSharesForRecipient(user.uid), getAllUserVideoStates(user.uid),
      ]);
      const personal = personalVideos.map(personalVideoToVideoWithState);
      const shared: VideoWithState[] = [];
      acceptedShares.filter((share) => share.approvalStatus === "accepted").forEach((share) => {
        if (share.entityType === "video" && share.videoUrl) shared.push(sharedVideoFromRecord(share, share));
        else (share.videos || []).forEach((video) => shared.push(sharedVideoFromRecord(share, video)));
      });

      const priority: Record<DiscoverySource, number> = { personal: 2, shared: 1 };
      const deduped = new Map<string, VideoWithState>();
      [...shared, ...personal].forEach((video) => {
        const key = video.videoUrl.trim().toLowerCase();
        const current = deduped.get(key);
        if (!current || priority[video.source || "shared"] > priority[current.source || "shared"]) deduped.set(key, video);
      });
      setVideos(Array.from(deduped.values()));
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(videos.map((video) => video.categoryId).filter(Boolean))) as string[];
  const tags = Array.from(new Set(videos.flatMap((video) => video.tagIds || [])));
  const filtered = React.useMemo(() => applySort(videos.filter((video) => {
    if (!sources[video.source || "shared"]) return false;
    if (platform !== "all" && (video.platform || "generic") !== platform) return false;
    if (categoryId !== "all" && video.categoryId !== categoryId) return false;
    if (tagId !== "all" && !(video.tagIds || []).includes(tagId)) return false;
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      if (!`${video.title} ${video.creatorName || ""} ${video.playlistTitle || ""}`.toLowerCase().includes(needle)) return false;
    }
    return true;
  }), sort), [videos, sources, platform, categoryId, tagId, query, sort]);

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <div><h1 className="font-display text-2xl font-semibold">Library</h1><p className="text-sm text-muted-foreground">Search and discover videos you can access. Manage them from Playlists or Shared.</p></div>
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, creator, or playlist" className="flex-1" />
            <Select value={sort} onValueChange={(value) => setSort(value as SortOption)}><SelectTrigger className="md:w-44"><SelectValue placeholder="Sort" /></SelectTrigger><SelectContent><SelectItem value="recently-added">Recently added</SelectItem><SelectItem value="title-asc">Title A-Z</SelectItem><SelectItem value="title-desc">Title Z-A</SelectItem><SelectItem value="progress">Progress</SelectItem><SelectItem value="duration">Duration</SelectItem></SelectContent></Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={platform} onValueChange={(value) => setPlatform(value as VideoPlatform | "all")}><SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger><SelectContent><SelectItem value="all">All platforms</SelectItem>{VIDEO_PLATFORMS.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            <Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{categories.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            <Select value={tagId} onValueChange={setTagId}><SelectTrigger className="w-32"><SelectValue placeholder="Tag" /></SelectTrigger><SelectContent><SelectItem value="all">All tags</SelectItem>{tags.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>
            {(Object.keys(SOURCE_LABELS) as DiscoverySource[]).map((source) => <label key={source} className="flex items-center gap-1.5 text-sm"><Checkbox checked={sources[source]} onCheckedChange={(checked) => setSources((current) => ({ ...current, [source]: checked === true }))} />{SOURCE_LABELS[source]}</label>)}
            <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setPlatform("all"); setCategoryId("all"); setTagId("all"); setSources({ personal: true, shared: true }); }}>Clear</Button>
          </div>
        </div>
        <VideoGrid videos={filtered} loading={loading} emptyTitle="Nothing matches your library" emptyHint="Try changing your search or filters." />
      </div>
    </AppShell>
  );
}

function sharedVideoFromRecord(share: ShareRecord, video: ShareRecord | NonNullable<ShareRecord["videos"]>[number]): VideoWithState {
  const isRecord = "entityType" in video;
  return {
    id: isRecord ? video.entityId : video.id,
    playlistId: share.entityId,
    title: video.title,
    videoUrl: video.videoUrl || "",
    thumbnailUrl: video.thumbnailUrl || "",
    durationSeconds: isRecord ? undefined : video.durationSeconds || undefined,
    platform: isRecord ? video.platform || undefined : video.platform,
    order: 0,
    createdAt: (share.createdAt as any) || null,
    updatedAt: (share.updatedAt as any) || null,
    playlistTitle: share.entityType === "playlist" ? share.title : undefined,
    source: "shared",
    shareToken: share.shareToken,
    shareEntityType: share.entityType,
    state: null,
  };
}