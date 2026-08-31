"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export function AppShell({
  children, onSearch,
}: { children: React.ReactNode; onSearch?: (q: string) => void }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    // h-screen + overflow-hidden turns this into a fixed "app shell": the
    // sidebar and header stay in place, and only <main> scrolls. Previously
    // this was min-h-screen with no overflow control, so a tall page (a
    // playlist with hundreds of videos) scrolled the *whole* layout —
    // sidebar and header included — out of view.
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setMobileOpen(true)} onSearch={onSearch} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
