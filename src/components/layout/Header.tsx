"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileVideo, ListVideo, Menu, Search, LogOut, Settings, ShieldCheck, User as UserIcon } from "lucide-react";
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
import type { PersonalPlaylist } from "@/types";

export function Header({ onMenuClick, onSearch }: { onMenuClick?: () => void; onSearch?: (q: string) => void }) {
  const { user, profile, logout, isAdmin } = useAuth();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [saveVideoOpen, setSaveVideoOpen] = React.useState(false);
  const [addPlaylistOpen, setAddPlaylistOpen] = React.useState(false);
  const [playlists, setPlaylists] = React.useState<PersonalPlaylist[]>([]);

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
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <form
        className="relative flex-1 min-w-0 max-w-md"
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
              <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" onClick={handleOpenSaveVideo} aria-label="Save video">
                <FileVideo className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Save video</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save video</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" onClick={() => setAddPlaylistOpen(true)} aria-label="Add playlist">
                <ListVideo className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Add playlist</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add playlist</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2 sm:px-2.5" aria-label="Import playlist">
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
            <button className="ml-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
            <DropdownMenuItem onClick={() => router.push("/dashboard")}>
              <UserIcon className="h-4 w-4" /> My Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="h-4 w-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
