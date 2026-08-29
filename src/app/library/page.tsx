"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { VideoGrid } from "@/components/video/VideoGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShareDialog } from "@/components/share/ShareDialog";
import { useVideoLibrary } from "@/hooks/useVideoLibrary";
import { addExistingVideoToPersonalPlaylist, bulkAddVideosToPersonalPlaylist, listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import { createOrUpdateVideoShare } from "@/lib/firestore/shares";
import { getShareUrl } from "@/lib/sharing";
import { applyFilters, applySort } from "@/lib/filterSort";
import type { HomeFilters, PersonalPlaylist, PriorityLevel, ShareVisibility, SortOption, VideoPlatform, VideoWithState } from "@/types";
import { VIDEO_PLATFORMS } from "@/types";
import { bulkSetPriority, bulkSetWatchedStatus, bulkToggleFavorite, bulkToggleWatchLater, setPriority, setWatchedStatus, toggleFavorite, toggleWatchLater } from "@/lib/firestore/userVideoState";
import { toast } from "sonner";

export default function LibraryPage() {
  return (
    <RequireAuth>
      <LibraryContent />
    </RequireAuth>
  );
}

function LibraryContent() {
  const { user } = useAuth();
  const { loading, videos, refresh, playlists } = useVideoLibrary(user?.uid);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOption>("recently-added");
  const [filters, setFilters] = React.useState<HomeFilters>({});
  const [personalPlaylists, setPersonalPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const allPlaylists = React.useMemo(() => [...new Map(playlists.map((playlist) => [playlist.id, playlist])).values()], [playlists]);
  const [playlistDialogOpen, setPlaylistDialogOpen] = React.useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = React.useState("");
  const [selectedVideo, setSelectedVideo] = React.useState<VideoWithState | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
  const [shareVisibility, setShareVisibility] = React.useState<ShareVisibility>("private");
  const [shareUrl, setShareUrl] = React.useState("");
  const [playlistActionLoading, setPlaylistActionLoading] = React.useState(false);
  const [shareBusy, setShareBusy] = React.useState(false);

  React.useEffect(() => {
    if (!user?.uid) return;
    listPersonalPlaylists(user.uid).then(setPersonalPlaylists).catch(() => setPersonalPlaylists([]));
  }, [user?.uid]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    const normalizedFilters: HomeFilters = { ...filters, ...(q ? { query: q } : {}) };
    const base = applyFilters(videos, normalizedFilters);
    return applySort(base, sort);
  }, [videos, filters, query, sort]);

  const selectedVideos = React.useMemo(() => filtered.filter((video) => selectedIds.includes(video.id)), [filtered, selectedIds]);

  const handleToggleSelect = (videoId: string) => {
    setSelectedIds((current) => current.includes(videoId) ? current.filter((id) => id !== videoId) : [...current, videoId]);
  };

  const handleBulkAddToPlaylist = async (playlistId: string) => {
    if (!user || selectedVideos.length === 0) return;
    const added = await bulkAddVideosToPersonalPlaylist(
      user.uid,
      playlistId,
      selectedVideos.map((video) => ({
        title: video.title,
        videoUrl: video.videoUrl,
        youtubeVideoId: video.youtubeVideoId,
        thumbnailUrl: video.thumbnailUrl,
        durationSeconds: video.durationSeconds,
        description: video.description ?? null,
        creator: video.creatorName ?? null,
        platform: video.platform,
      }))
    );
    if (added === 0) {
      toast.error("Those videos are already in this playlist.");
      return;
    }
    setSelectedIds([]);
    toast.success(`Added ${added} video${added === 1 ? "" : "s"} to playlist`);
  };

  const handleBulkPriority = async (value: PriorityLevel) => {
    if (!user || selectedVideos.length === 0) return;
    const playlistIdByVideo = Object.fromEntries(selectedVideos.map((video) => [video.id, video.playlistId]));
    await bulkSetPriority(user.uid, selectedVideos.map((video) => video.id), playlistIdByVideo, value);
    setSelectedIds([]);
    toast.success(value ? `Priority set to ${value}` : "Priority cleared");
    await refresh();
  };

  const handleBulkWatched = async (watch: boolean) => {
    if (!user || selectedVideos.length === 0) return;
    const playlistIdByVideo = Object.fromEntries(selectedVideos.map((video) => [video.id, video.playlistId]));
    await bulkSetWatchedStatus(user.uid, selectedVideos.map((video) => video.id), playlistIdByVideo, watch);
    setSelectedIds([]);
    toast.success(watch ? "Marked watched" : "Marked unwatched");
    await refresh();
  };

  const handleBulkFavorite = async (value: boolean) => {
    if (!user || selectedVideos.length === 0) return;
    const playlistIdByVideo = Object.fromEntries(selectedVideos.map((video) => [video.id, video.playlistId]));
    await bulkToggleFavorite(user.uid, selectedVideos.map((video) => video.id), playlistIdByVideo, value);
    setSelectedIds([]);
    toast.success(value ? "Saved to favorites" : "Removed from favorites");
    await refresh();
  };

  const handleBulkWatchLater = async (value: boolean) => {
    if (!user || selectedVideos.length === 0) return;
    const playlistIdByVideo = Object.fromEntries(selectedVideos.map((video) => [video.id, video.playlistId]));
    await bulkToggleWatchLater(user.uid, selectedVideos.map((video) => video.id), playlistIdByVideo, value);
    setSelectedIds([]);
    toast.success(value ? "Added to Watch Later" : "Removed from Watch Later");
    await refresh();
  };

  const handleClearFilters = () => {
    setQuery("");
    setFilters({});
  };

  const handleToggleFavorite = async (video: VideoWithState) => {
    if (!user) return;
    const next = !video.state?.isFavorite;
    await toggleFavorite(user.uid, video.id, video.playlistId, next);
    toast.success(next ? "Saved to favorites" : "Removed from favorites");
    await refresh();
  };

  const handleToggleWatchLater = async (video: VideoWithState) => {
    if (!user) return;
    const next = !video.state?.isWatchLater;
    await toggleWatchLater(user.uid, video.id, video.playlistId, next);
    toast.success(next ? "Added to Watch Later" : "Removed from Watch Later");
    await refresh();
  };

  const handleSetPriority = async (video: VideoWithState, value: PriorityLevel) => {
    if (!user) return;
    await setPriority(user.uid, video.id, video.playlistId, value);
    toast.success(value ? `Priority set to ${value}` : "Priority cleared");
    await refresh();
  };

  const handleToggleWatched = async (video: VideoWithState) => {
    if (!user) return;
    const next = video.state?.status !== "completed";
    await setWatchedStatus(user.uid, video.id, video.playlistId, next);
    toast.success(next ? "Marked watched" : "Marked unwatched");
    await refresh();
  };

  const handleAddToPlaylist = (video: VideoWithState) => {
    if (!user) return;
    setSelectedVideo(video);
    setSelectedPlaylistId(personalPlaylists[0]?.id ?? "");
    setPlaylistDialogOpen(true);
  };

  const handleConfirmAddToPlaylist = async () => {
    if (!user || !selectedVideo || !selectedPlaylistId) {
      if (selectedVideos.length > 0 && selectedPlaylistId) {
        setPlaylistActionLoading(true);
        try {
          await handleBulkAddToPlaylist(selectedPlaylistId);
          setPlaylistDialogOpen(false);
          setSelectedVideo(null);
          setSelectedPlaylistId("");
        } finally {
          setPlaylistActionLoading(false);
        }
        return;
      }
      toast.error("Choose a playlist first.");
      return;
    }

    setPlaylistActionLoading(true);
    try {
      const added = await addExistingVideoToPersonalPlaylist(user.uid, selectedPlaylistId, {
        title: selectedVideo.title,
        videoUrl: selectedVideo.videoUrl,
        youtubeVideoId: selectedVideo.youtubeVideoId,
        thumbnailUrl: selectedVideo.thumbnailUrl,
        durationSeconds: selectedVideo.durationSeconds,
        description: selectedVideo.description ?? null,
        creator: selectedVideo.creatorName ?? null,
        platform: selectedVideo.platform,
      });

      if (!added) {
        toast.error("This video is already in that playlist.");
        return;
      }

      toast.success("Added to playlist");
      setPlaylistDialogOpen(false);
      setSelectedVideo(null);
      setSelectedPlaylistId("");
    } finally {
      setPlaylistActionLoading(false);
    }
  };

  const handleShareVideo = async (video: VideoWithState) => {
    if (!user) return;
    setSelectedVideo(video);
    setShareBusy(true);
    try {
      const record = await createOrUpdateVideoShare(user.uid, {
        id: video.id,
        title: video.title,
        videoUrl: video.videoUrl,
        thumbnailUrl: video.thumbnailUrl,
        description: video.description || null,
        platform: video.platform,
        creatorName: video.creatorName ?? null,
        durationSeconds: video.durationSeconds || null,
      }, "private");
      setShareVisibility(record.visibility || "private");
      setShareUrl(getShareUrl(record.shareToken, "video"));
      setShareDialogOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Unable to prepare this share.");
    } finally {
      setShareBusy(false);
    }
  };

  const handleShareVisibilityChange = async (next: ShareVisibility) => {
    if (!user || !selectedVideo) return;
    const record = await createOrUpdateVideoShare(user.uid, {
      id: selectedVideo.id,
      title: selectedVideo.title,
      videoUrl: selectedVideo.videoUrl,
      thumbnailUrl: selectedVideo.thumbnailUrl,
      description: selectedVideo.description || null,
      platform: selectedVideo.platform,
      creatorName: selectedVideo.creatorName ?? null,
      durationSeconds: selectedVideo.durationSeconds || null,
    }, next);
    setShareVisibility(record.visibility || "private");
    setShareUrl(getShareUrl(record.shareToken, "video"));
    toast.success(`Sharing updated to ${next === "unlisted" ? "Anyone with link" : next === "public" ? "Public" : "Private"}.`);
  };

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Share link copied");
  };

  const handleRevokeShare = async () => {
    if (!user || !selectedVideo) return;
    const existing = await createOrUpdateVideoShare(user.uid, {
      id: selectedVideo.id,
      title: selectedVideo.title,
      videoUrl: selectedVideo.videoUrl,
      thumbnailUrl: selectedVideo.thumbnailUrl,
      description: selectedVideo.description || null,
      platform: selectedVideo.platform,
      creatorName: selectedVideo.creatorName ?? null,
      durationSeconds: selectedVideo.durationSeconds || null,
    }, "private", true);
    setShareVisibility("private");
    setShareUrl(existing.shareToken ? getShareUrl(existing.shareToken, "video") : "");
    setShareDialogOpen(false);
    toast.success("Sharing revoked");
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold">My Video Library</h1>
            <p className="text-sm text-muted-foreground">Browse saved videos, monitor progress, and manage your personal learning queue.</p>
          </div>
          <div className="flex w-full max-w-lg flex-col gap-2 sm:flex-row">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, creator, or playlist"
              className="w-full"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortOption)}
              className="h-10 rounded-md border border-input bg-background px-2 text-sm sm:w-auto"
            >
              <option value="recently-added">Recently Added</option>
              <option value="recently-watched">Recently Watched</option>
              <option value="title-asc">Title A–Z</option>
              <option value="title-desc">Title Z–A</option>
              <option value="progress">Progress</option>
              <option value="priority">Priority</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 md:flex md:flex-wrap md:items-center md:gap-2">
            <Select value={filters.platform || "all"} onValueChange={(value) => setFilters((f) => ({ ...f, platform: value === "all" ? null : (value as VideoPlatform) }))}>
              <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {VIDEO_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>{platform}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.playlistId || "all"} onValueChange={(value) => setFilters((f) => ({ ...f, playlistId: value === "all" ? null : value }))}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Playlist" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All playlists</SelectItem>
                {allPlaylists.map((playlist) => (
                  <SelectItem key={playlist.id} value={playlist.id}>{playlist.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.status || "all"} onValueChange={(value) => setFilters((f) => ({ ...f, status: value === "all" ? null : (value as any) }))}>
              <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                <SelectItem value="completed">Watched</SelectItem>
                <SelectItem value="not_started">Unwatched</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.priority || "all"} onValueChange={(value) => setFilters((f) => ({ ...f, priority: value === "all" ? null : (value as any) }))}>
              <SelectTrigger className="w-full md:w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any priority</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            <Button variant={filters.favoriteOnly ? "accent" : "outline"} size="sm" className="w-full md:w-auto" onClick={() => setFilters((f) => ({ ...f, favoriteOnly: !f.favoriteOnly }))}>
              Favorites
            </Button>
            <Button variant={filters.watchLaterOnly ? "accent" : "outline"} size="sm" className="w-full md:w-auto" onClick={() => setFilters((f) => ({ ...f, watchLaterOnly: !f.watchLaterOnly }))}>
              Watch Later
            </Button>
            <Button variant="ghost" size="sm" className="w-full md:w-auto" onClick={handleClearFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Clear</Button>
            <Button variant="outline" size="sm" onClick={() => { if (!user || selectedVideos.length === 0) return; setSelectedVideo(null); setSelectedPlaylistId(personalPlaylists[0]?.id ?? ""); setPlaylistDialogOpen(true); }}>Add to playlist</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkWatched(true)}>Mark watched</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkWatched(false)}>Mark unwatched</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkFavorite(true)}>Favorite</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkFavorite(false)}>Unfavorite</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkWatchLater(true)}>Add to Watch Later</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkWatchLater(false)}>Remove from Watch Later</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkPriority("high")}>High priority</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkPriority("medium")}>Medium priority</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkPriority("low")}>Low priority</Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkPriority(null)}>Clear priority</Button>
          </div>
        )}

        <VideoGrid
          videos={filtered}
          loading={loading}
          emptyTitle="No videos in your library"
          emptyHint="Add a video to your personal playlist or saved library to see it here."
          showActions
          showSelection
          selectedIds={selectedIds}
          onToggleSelect={handleToggleSelect}
          onToggleFavorite={handleToggleFavorite}
          onToggleWatchLater={handleToggleWatchLater}
          onSetPriority={handleSetPriority}
          onToggleWatched={handleToggleWatched}
          onAddToPlaylist={handleAddToPlaylist}
          onShare={handleShareVideo}
        />
      </div>

      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          setShareDialogOpen(open);
          if (!open) {
            setSelectedVideo(null);
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

      <Dialog open={playlistDialogOpen} onOpenChange={(open) => {
        setPlaylistDialogOpen(open);
        if (!open) {
          setSelectedVideo(null);
          setSelectedPlaylistId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add video to playlist</DialogTitle>
          </DialogHeader>
          {personalPlaylists.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a personal playlist first, then add this video there.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{selectedVideo?.title}</p>
              <Select value={selectedPlaylistId} onValueChange={setSelectedPlaylistId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a playlist" />
                </SelectTrigger>
                <SelectContent>
                  {personalPlaylists.map((playlist) => (
                    <SelectItem key={playlist.id} value={playlist.id}>{playlist.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlaylistDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmAddToPlaylist} disabled={playlistActionLoading || personalPlaylists.length === 0 || !selectedPlaylistId}>
              {playlistActionLoading ? "Adding…" : "Add to playlist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
