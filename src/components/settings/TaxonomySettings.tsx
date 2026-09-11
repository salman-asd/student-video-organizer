"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createCategory, createTag, deleteCategory, deleteTag, listCategories, listTags, updateCategory, updateTag,
} from "@/lib/firestore/categoriesTags";
import type { Category, Tag } from "@/types";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

export function TaxonomySettings({ mode }: { mode: "categories" | "tags" }) {
  const { user } = useAuth();
  const [items, setItems] = React.useState<Array<Category | Tag>>([]);
  const [name, setName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const isCategories = mode === "categories";
  const noun = isCategories ? "category" : "tag";

  const load = React.useCallback(async () => {
    if (!user) return;
    setItems(isCategories ? await listCategories(user.uid) : await listTags());
  }, [isCategories, user]);

  React.useEffect(() => { load(); }, [load]);

  async function addItem() {
    if (!user || !name.trim()) return;
    try {
      if (isCategories) await createCategory(name, user.uid);
      else await createTag(name, user.uid);
      setName("");
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} added`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || `Unable to add ${noun}.`);
    }
  }

  async function saveItem(id: string) {
    if (!editingName.trim()) return;
    try {
      if (isCategories) await updateCategory(user!.uid, id, editingName);
      else await updateTag(id, editingName);
      setEditingId(null);
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} updated`);
      await load();
    } catch (error: any) {
      toast.error(error?.message || `Unable to update ${noun}.`);
    }
  }

  async function removeItem(id: string) {
    if (!user || !confirm(`Delete this ${noun}? Existing videos may lose this assignment.`)) return;
    try {
      if (isCategories) await deleteCategory(user.uid, id);
      else await deleteTag(id);
      await load();
      toast.success(`${noun[0].toUpperCase()}${noun.slice(1)} deleted`);
    } catch (error: any) {
      toast.error(error?.message || `Unable to delete ${noun}.`);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">{isCategories ? "Categories" : "Tags"}</h1>
          <p className="text-sm text-muted-foreground">
            Create, rename, and remove {isCategories ? "your personal categories" : "shared tags used to organize content"}.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void addItem(); }}
                placeholder={`e.g. ${isCategories ? "Programming" : "Beginner"}`}
                aria-label={`New ${noun} name`}
              />
              <Button onClick={() => void addItem()} disabled={!name.trim()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>

            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                  {editingId === item.id ? (
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") void saveItem(item.id); }}
                      autoFocus
                      aria-label={`Edit ${noun} name`}
                    />
                  ) : (
                    <Badge variant={isCategories ? "secondary" : "outline"} className="flex-1 justify-start">
                      {item.name}
                    </Badge>
                  )}
                  {editingId === item.id ? (
                    <Button variant="ghost" size="icon" onClick={() => void saveItem(item.id)} aria-label={`Save ${noun}`}>
                      <Check className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" onClick={() => { setEditingId(item.id); setEditingName(item.name); }} aria-label={`Edit ${noun}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => void removeItem(item.id)} aria-label={`Delete ${noun}`}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-muted-foreground">No {noun}s yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}