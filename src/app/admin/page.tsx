"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listUsers, recomputeUserStats } from "@/lib/firestore/users";
import { formatWatchTime } from "@/lib/utils";
import type { UserProfile } from "@/types";
import { RefreshCw, Search, Flame } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <RequireAdmin>
      <AdminDashboardContent />
    </RequireAdmin>
  );
}

function AdminDashboardContent() {
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setUsers(await listUsers());
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function refreshAllStats() {
    setRefreshing(true);
    for (const u of users) await recomputeUserStats(u.uid);
    await load();
    setRefreshing(false);
  }

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">{users.length} registered students</p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAllStats} disabled={refreshing}>
            <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh stats
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search students…" className="pl-8" />
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Videos</th>
                  <th className="p-3">Completed</th>
                  <th className="p-3">In Progress</th>
                  <th className="p-3">Favorites</th>
                  <th className="p-3">Watch Later</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Watch Time</th>
                  <th className="p-3">Streak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={10} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>
                    ))
                  : filtered.map((u) => (
                      <tr key={u.uid} className="transition-colors hover:bg-secondary/40">
                        <td className="p-3">
                          <Link href={`/admin/users/${u.uid}`} className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8"><AvatarFallback>{(u.displayName || u.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{u.displayName}</p>
                              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="p-3"><Badge variant={u.status === "active" ? "success" : "destructive"}>{u.status}</Badge></td>
                        <td className="p-3">{u.stats?.totalVideos ?? "—"}</td>
                        <td className="p-3">{u.stats?.completed ?? "—"}</td>
                        <td className="p-3">{u.stats?.inProgress ?? "—"}</td>
                        <td className="p-3">{u.stats?.favorites ?? "—"}</td>
                        <td className="p-3">{u.stats?.watchLater ?? "—"}</td>
                        <td className="p-3">{u.stats?.priority ?? "—"}</td>
                        <td className="p-3">{u.stats ? formatWatchTime(u.stats.totalWatchTimeSeconds) : "—"}</td>
                        <td className="p-3">
                          {u.stats?.currentStreakDays ? (
                            <span className="flex items-center gap-1 text-accent"><Flame className="h-3.5 w-3.5" /> {u.stats.currentStreakDays}d</span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </Card>

        {!loading && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No students match &quot;{query}&quot;.</p>
        )}
        {!loading && users.some((u) => !u.stats) && (
          <p className="text-xs text-muted-foreground">Some students haven&apos;t had their stats computed yet — click &quot;Refresh stats&quot; above.</p>
        )}
      </div>
    </AppShell>
  );
}
