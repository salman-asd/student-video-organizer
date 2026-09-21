"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Compass, Download, FileVideo, KeyRound, ListVideo, Menu, RotateCcw, Search, LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { QuickAddVideoDialog } from "@/components/video/QuickAddVideoDialog";
import { QuickAddPlaylistDialog } from "@/components/video/QuickAddPlaylistDialog";
import { listPersonalPlaylists } from "@/lib/firestore/personalPlaylists";
import {
  countUnreadNotifications, listNotifications, markAllNotificationsRead, markNotificationRead,
} from "@/lib/firestore/notifications";
import { formatUnreadBadge, recentNotifications, relativeTimeLabel } from "@/lib/notificationUtils";
import { cn } from "@/lib/utils";
import { useTour } from "@/components/tour/TourProvider";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { tourForPath } from "@/lib/tour/tours";
import type { AppNotification, PersonalPlaylist } from "@/types";

export function Header({ onMenuClick, onSearch }: { onMenuClick?: () => void; onSearch?: (q: string) => void }) {
  const { user, profile, logout, isAdmin, hasPasswordProvider } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { startTour, resetAll } = useTour();
  const pageTour = tourForPath(pathname);
  const [query, setQuery] = React.useState("");
  const [saveVideoOpen, setSaveVideoOpen] = React.useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = React.useState(false);
  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [notificationsBusy, setNotificationsBusy] = React.useState(false);

  const uid = user?.uid;

  // Lightweight on-load query (no live listener, matching the free-tier
  // convention used by the rest of this app). The unread count is a separate
  // aggregation-style query so the badge stays correct even when older unread
  // notifications fall outside the fetched window.
  const refreshNotifications = React.useCallback(async () => {
    if (!uid) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    const [items, unread] = await Promise.all([
      listNotifications(uid).catch(() => [] as AppNotification[]),
      countUnreadNotifications(uid),
    ]);
    setNotifications(items);
    setUnreadCount(unread);
  }, [uid]);

  React.useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  async function handleNotificationClick(notification: AppNotification) {
    if (!uid) return;
    if (notification.read) return;

    // Optimistic: the badge should clear the instant it's clicked, not after
    // a round trip. Reverting on failure keeps it honest if the write fails.
    setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await markNotificationRead(uid, notification.id);
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: false } : n)));
      setUnreadCount((count) => count + 1);
    }
  }

  async function handleNotificationNavigate(notification: AppNotification) {
    await handleNotificationClick(notification);
    if (notification.linkHref) router.push(notification.linkHref);
  }

  async function handleMarkAllRead() {
    if (!uid || unreadCount === 0) return;
    setNotificationsBusy(true);
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead(uid);
      await refreshNotifications();
    } catch {
      setNotifications(previous);
      await refreshNotifications();
    } finally {
      setNotificationsBusy(false);
    }
  }

  const recent = React.useMemo(() => recentNotifications(notifications), [notifications]);

  async function handleLogout() {
    await logout();
    router.push("/login");
    toast.success("Logged out");
  }

  async function handleOpenSaveVideo() {
    if (!user?.uid) return;
    const nextPlaylists = await listPersonalPlaylists(user.uid).catch(() => [] as PersonalPlaylist[]);
    setPlaylists(nextPlaylists);
    setSaveVideoOpen(true);
  }

  async function refreshPlaylists() {
    if (!user?.uid) return;
    setPlaylists(await listPersonalPlaylists(user.uid).catch(() => [] as PersonalPlaylist[]));
  }

  const initials = (profile?.displayName || profile?.email || "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open menu" data-tour="header-menu">
        <Menu className="h-5 w-5" />
      </Button>

      <form
        className="relative flex-1 min-w-0 max-w-md"
        data-tour="header-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch?.(query);
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onSearch?.(e.target.value);
          }}
          placeholder="Search videos, playlists, tags, notes…"
          className="w-full pl-8"
        />
      </form>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {isAdmin && (
          <span className="hidden items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent sm:flex">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </span>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" onClick={handleOpenSaveVideo} aria-label="Save video" data-tour="header-save-video">
                <FileVideo className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Save video</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save video</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" onClick={() => setAddPlaylistOpen(true)} aria-label="Add playlist" data-tour="header-add-playlist">
                <ListVideo className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Add playlist</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add playlist</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" aria-label="Import playlist" data-tour="header-import">
                <Link href="/playlists/import" className="inline-flex items-center gap-1.5">
                  <Download className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Import playlist</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import playlist</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              data-tour="header-bell"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-foreground">
                  {formatUnreadBadge(unreadCount)}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={notificationsBusy}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                >
                  {notificationsBusy ? "Marking…" : "Mark all read"}
                </button>
              )}
            </div>
            <DropdownMenuSeparator className="my-0" />
            {recent.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
            ) : (
              <div className="max-h-96 overflow-y-auto py-1">
                {recent.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationNavigate(notification)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-secondary",
                      !notification.read && "bg-accent/5"
                    )}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                          notification.read ? "bg-transparent" : "bg-accent"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm", notification.read ? "font-normal" : "font-medium")}>
                          {notification.title}
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                            {notification.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {relativeTimeLabel(notification.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <DropdownMenuSeparator className="my-0" />
            <DropdownMenuItem
              onClick={() => router.push("/notifications")}
              className="justify-center px-3 py-2 text-xs font-medium text-accent"
            >
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-tour="header-user" aria-label="Account menu">
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="flex flex-col">
              <span className="font-medium text-foreground">{profile?.displayName}</span>
              <span className="font-normal text-muted-foreground">{profile?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/notifications")}>
              <Bell className="h-4 w-4" /> Notifications
              {unreadCount > 0 && (
                <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                  {formatUnreadBadge(unreadCount)}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <UserIcon className="h-4 w-4" /> My Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => startTour("welcome", { force: true })}>
              <Compass className="h-4 w-4" /> Take the welcome tour
            </DropdownMenuItem>
            {pageTour && pageTour.id !== "welcome" && (
              <DropdownMenuItem onClick={() => startTour(pageTour.id, { force: true })}>
                <Compass className="h-4 w-4" /> {pageTour.label}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => { void resetAll().then(() => toast.success("Tours reset — they'll be offered again.")); }}>
              <RotateCcw className="h-4 w-4" /> Replay all tours
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Only email+password accounts have a password to change (Google-only accounts do not). */}
            {hasPasswordProvider && (
              <DropdownMenuItem onSelect={() => { setTimeout(() => setChangePasswordOpen(true), 0); }}>
                <KeyRound className="h-4 w-4" /> Change password
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {hasPasswordProvider && <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />}
      {user?.uid && <QuickAddVideoDialog
        ownerId={user.uid}
        playlists={playlists}
        open={saveVideoOpen}
        onOpenChange={setSaveVideoOpen}
        onSaved={() => listPersonalPlaylists(user.uid).then(setPlaylists).catch(() => {})}
      />}
      {user?.uid && <QuickAddPlaylistDialog
        ownerId={user.uid}
        open={addPlaylistOpen}
        onOpenChange={setAddPlaylistOpen}
        onCreated={refreshPlaylists}
      />}
    </header>
  );
}
