"use client";

import * as React from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listUsers, setUserStatus } from "@/lib/firestore/users";
import type { UserProfile } from "@/types";
import { Search, ShieldOff, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Pure user list + management — enable/disable and role changes only.
 * Aggregate stats/analytics live on /admin/dashboard instead, so this page
 * stays focused on "find a user, act on their account" rather than mixing
 * in platform-wide numbers.
 */
export default function AllUsersPage() {
  return (
    <RequireAdmin>
      <AllUsersContent />
    </RequireAdmin>
  );
}

function AllUsersContent() {
  const { profile: currentAdmin } = useAuth();
  const [users, setUsers] = React.useState<UserProfile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [pendingUid, setPendingUid] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setUsers(await listUsers());
    setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function handleToggleStatus(u: UserProfile) {
    const next = u.status === "active" ? "disabled" : "active";
    setPendingUid(u.uid);
    try {
      await setUserStatus(u.uid, next);
      setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, status: next } : x)));
      toast.success(next === "active" ? `${u.displayName || u.email} re-enabled` : `${u.displayName || u.email} disabled`);
    } catch (err: any) {
      toast.error(err?.message || "Couldn't update this user. Try again.");
    } finally {
      setPendingUid(null);
    }
  }

  const filtered = users.filter((u) => {
    const q = query.toLowerCase();
    return u.displayName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">All Users</h1>
          <p className="text-sm text-muted-foreground">{users.length} registered users — find, enable/disable, or open a user's details.</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users…" className="pl-8" />
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3">User</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={4} className="p-3"><Skeleton className="h-8 w-full" /></td></tr>
                    ))
                  : filtered.map((u) => {
                      const isSelf = u.uid === currentAdmin?.uid;
                      return (
                        <tr key={u.uid} className="transition-colors hover:bg-secondary/40">
                          <td className="p-3">
                            <Link href={`/admin/users/${u.uid}`} className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8"><AvatarFallback>{(u.displayName || u.email).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{u.displayName}{isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}</p>
                                <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </Link>
                          </td>
                          <td className="p-3"><Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge></td>
                          <td className="p-3"><Badge variant={u.status === "active" ? "success" : "destructive"}>{u.status}</Badge></td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant={u.status === "active" ? "destructive" : "default"}
                                size="sm"
                                disabled={isSelf || pendingUid === u.uid}
                                onClick={() => handleToggleStatus(u)}
                                title={isSelf ? "You can't disable your own account" : undefined}
                              >
                                {u.status === "active" ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                {pendingUid === u.uid ? "…" : u.status === "active" ? "Disable" : "Enable"}
                              </Button>
                              <Button variant="ghost" size="sm" asChild>
                                <Link href={`/admin/users/${u.uid}`}><ExternalLink className="h-3.5 w-3.5" /> Details</Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </Card>

        {!loading && filtered.length === 0 && (
          <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No users match &quot;{query}&quot;.</p>
        )}
      </div>
    </AppShell>
  );
}
