"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listUsers } from "@/lib/firestore/users";
import { computeActiveUserCounts, computeSignupsPerDay, type ActiveUserCounts, type SignupsPerDay } from "@/lib/adminAnalytics";
import type { UserProfile } from "@/types";
import { Users, UserCheck, UserX, ShieldCheck, TrendingUp } from "lucide-react";

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

  React.useEffect(() => {
    listUsers().then((u) => {
      setUsers(u);
      setLoading(false);
    });
  }, []);

  const counts: ActiveUserCounts | null = loading ? null : computeActiveUserCounts(users);
  const signups: SignupsPerDay[] = loading ? [] : computeSignupsPerDay(users, 30);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide activity at a glance. For individual users, see{" "}
            <a href="/admin" className="text-accent underline">All Users</a>.
          </p>
        </div>

        {loading || !counts ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={Users} label="Total users" value={counts.totalUsers} />
              <StatCard icon={UserCheck} label="Active today" value={counts.activeToday} sub={`${counts.activeThisWeek} this week`} />
              <StatCard icon={ShieldCheck} label="Admins" value={counts.adminCount} sub={`${counts.studentCount} students`} />
              <StatCard icon={UserX} label="Disabled" value={counts.disabledCount} sub={counts.neverLoggedIn ? `${counts.neverLoggedIn} never logged in` : undefined} />
            </div>

            <Card>
              <CardContent className="p-5">
                <div className="mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <h2 className="font-display text-base font-semibold">Signups — last 30 days</h2>
                </div>
                <SignupsChart data={signups} />
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Activity-based signup and login trends only — topic/category popularity and per-video engagement
              require a heavier aggregation pass across every user&apos;s activity log and aren&apos;t included here yet.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** Dependency-free inline SVG bar chart — no chart library is set up in
 *  this project yet, so this avoids requiring an `npm install` before the
 *  dashboard even builds. Swap for Recharts later if richer charts
 *  (tooltips, multiple series) are needed. */
function SignupsChart({ data }: { data: SignupsPerDay[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No signup data yet.</p>;

  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 600;
  const height = 120;
  const barWidth = width / data.length;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full min-w-[500px]" preserveAspectRatio="none">
        {data.map((d, i) => {
          const barHeight = (d.count / max) * (height - 20);
          return (
            <g key={d.date}>
              <rect
                x={i * barWidth + 1}
                y={height - barHeight - 16}
                width={Math.max(1, barWidth - 2)}
                height={barHeight}
                className="fill-accent/70"
                rx={1}
              >
                <title>{`${d.date}: ${d.count} signup${d.count === 1 ? "" : "s"}`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={0} y1={height - 16} x2={width} y2={height - 16} className="stroke-border" strokeWidth={1} />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
