"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listNotifications, markAllNotificationsRead, markNotificationRead,
} from "@/lib/firestore/notifications";
import { relativeTimeLabel, sortNotifications } from "@/lib/notificationUtils";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types";
import { Bell, Flag, Map, Sparkles } from "lucide-react";
import { toast } from "sonner";

const TYPE_ICONS = {
  goal_pace: Flag,
  roadmap_ready: Map,
  system: Sparkles,
} as const;

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsContent />
    </RequireAuth>
  );
}
function NotificationsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [marking, setMarking] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      setNotifications(await listNotifications(user.uid, 100));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const unread = notifications.filter((n) => !n.read).length;
  const ordered = React.useMemo(() => sortNotifications(notifications), [notifications]);

  async function handleOpen(notification: AppNotification) {
    if (!user?.uid) return;
    if (!notification.read) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n)));
      await markNotificationRead(user.uid, notification.id).catch(() => {});
    }
    if (notification.linkHref) router.push(notification.linkHref);
  }

  async function handleMarkAll() {
    if (!user?.uid || unread === 0) return;
    setMarking(true);
    try {
      await markAllNotificationsRead(user.uid);
      await refresh();
      toast.success("All notifications marked read.");
    } catch {
      toast.error("Couldn't mark everything read. Try again.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-semibold">
              <Bell className="h-5 w-5 text-accent" /> Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              Pace nudges and roadmap updates land here.
            </p>
          </div>
          <Button variant="outline" onClick={() => void handleMarkAll()} disabled={unread === 0} loading={marking}>
            {marking ? "Marking…" : "Mark all read"}
          </Button>
        </div>

        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)
        ) : ordered.length === 0 ? (
          <p className="rounded-lg border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            <Bell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            Nothing here yet. We&apos;ll let you know when a goal falls behind pace.
          </p>
        ) : (
          <div className="space-y-2">
            {ordered.map((notification) => {
              const Icon = TYPE_ICONS[notification.type] ?? Sparkles;
              return (
                <Card key={notification.id} className={cn(notification.read ? "opacity-70" : "border-accent/40")}>
                  <CardContent className="flex items-start gap-3 p-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                      <Icon className="h-4 w-4 text-accent" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-sm", notification.read ? "font-normal" : "font-medium")}>
                          {notification.title}
                        </span>
                        {!notification.read && <Badge variant="accent">New</Badge>}
                      </div>
                      {notification.body && <p className="text-xs text-muted-foreground">{notification.body}</p>}
                      <p className="text-[11px] text-muted-foreground">{relativeTimeLabel(notification.createdAt)}</p>
                    </div>
                    {notification.linkHref && (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => void handleOpen(notification)}>
                        Open
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
