"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ListVideo, Clock, Star, Flag, PlayCircle, BookOpen,
  ShieldCheck, Users, FolderKanban, Tags, FileJson, Youtube, Target, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";

const studentNav = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/continue-learning", label: "Continue Learning", icon: PlayCircle },
  { href: "/playlists", label: "Playlists", icon: ListVideo },
  { href: "/watch-later", label: "Watch Later", icon: Clock },
  { href: "/priority", label: "Priority", icon: Flag },
  { href: "/favorites", label: "Favorites", icon: Star },
  { href: "/goals", label: "Goals", icon: Target },
];

const adminNav = [
  { section: "Admin Dashboard", items: [{ href: "/admin", label: "All Users", icon: Users }] },
  {
    section: "Content",
    items: [
      { href: "/admin/playlists", label: "Playlists", icon: FolderKanban },
      { href: "/admin/categories", label: "Categories & Tags", icon: Tags },
    ],
  },
  {
    section: "Management",
    items: [
      { href: "/admin/import-json", label: "Import JSON", icon: FileJson },
      { href: "/admin/import-youtube", label: "Import YouTube Playlist", icon: Youtube },
    ],
  },
];

export function Sidebar({ mobileOpen, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  const content = (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5">
      <Link href="/dashboard" className="flex items-center gap-2 px-2" onClick={onClose}>
        <BookOpen className="h-6 w-6 text-accent" />
        <span className="font-display text-lg font-semibold tracking-tight">Study Lamp</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {studentNav.map((item) => (
          <SidebarLink key={item.href} {...item} active={pathname === item.href} onClick={onClose} />
        ))}
      </nav>

      {isAdmin && (
        <div className="mt-2 flex flex-col gap-4 border-t border-border pt-4">
          <div className="flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </div>
          {adminNav.map((group) => (
            <div key={group.section} className="flex flex-col gap-1">
              <div className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.section}
              </div>
              {group.items.map((item) => (
                <SidebarLink key={item.href} {...item} active={pathname === item.href || pathname.startsWith(item.href + "/")} onClick={onClose} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card/60 md:block">{content}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <div className="absolute left-0 top-0 h-full w-72 bg-card shadow-xl animate-fade-in">
            <button className="absolute right-3 top-4 p-1" onClick={onClose} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

function SidebarLink({
  href, label, icon: Icon, active, onClick,
}: { href: string; label: string; icon: any; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-secondary"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
