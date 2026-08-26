"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { addGoal, listGoals, removeGoal, toggleGoal } from "@/lib/firestore/goals";
import type { Goal } from "@/types";
import { Trash2, Target } from "lucide-react";

export default function GoalsPage() {
  return (
    <RequireAuth>
      <GoalsContent />
    </RequireAuth>
  );
}

function GoalsContent() {
  const { user } = useAuth();
  const [goals, setGoals] = React.useState<Goal[]>([]);
  const [title, setTitle] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setGoals(await listGoals(user.uid));
    setLoading(false);
  }, [user]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !title.trim()) return;
    await addGoal(user.uid, title.trim());
    setTitle("");
    refresh();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Learning Goals</h1>
          <p className="text-sm text-muted-foreground">Set intentions and check them off as you go.</p>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Finish the JavaScript Closures playlist" />
          <Button type="submit">Add Goal</Button>
        </form>

        <div className="space-y-2">
          {!loading && goals.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              <Target className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              No goals yet. Add your first one above.
            </p>
          )}
          {goals.map((g) => (
            <Card key={g.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <Checkbox
                  checked={g.completed}
                  onCheckedChange={async (v) => { await toggleGoal(user!.uid, g.id, !!v); refresh(); }}
                />
                <span className={g.completed ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{g.title}</span>
                <Button variant="ghost" size="icon" onClick={async () => { await removeGoal(user!.uid, g.id); refresh(); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
