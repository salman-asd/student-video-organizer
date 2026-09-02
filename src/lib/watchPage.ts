export function getBackToPlaylistHref(playlistId: string | null | undefined, ownerId?: string | null): string {
  if (!playlistId) return "/playlists";
  if (ownerId) return `/my-playlists/${playlistId}?owner=${ownerId}`;
  return `/playlists/${playlistId}`;
}

export function shouldUsePlaylistSidebar(playlistVisible: boolean, width: number): boolean {
  if (!playlistVisible) return false;
  return width >= 1024;
}

export function shouldShowPlaylistSidebarOnRight(width: number): boolean {
  return width >= 1280;
}
