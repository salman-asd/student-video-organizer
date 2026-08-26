"use client";

import * as React from "react";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createCategory, createTag, deleteCategory, deleteTag, listCategories, listTags,
} from "@/lib/firestore/categoriesTags";
import type { Category, Tag } from "@/types";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export default function AdminCategoriesPage() {
  return (
    <RequireAdmin>
      <AdminCategoriesContent />
    </RequireAdmin>
  );
}

function AdminCategoriesContent() {
  const { user } = useAuth();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [newCategory, setNewCategory] = React.useState("");
  const [newTag, setNewTag] = React.useState("");

  const load = React.useCallback(async () => {
    setCategories(await listCategories());
    setTags(await listTags());
  }, []);

  React.useEffect(() => { load(); }, [load]);

  async function addCategory() {
    if (!user || !newCategory.trim()) return;
    await createCategory(newCategory.trim(), user.uid);
    setNewCategory("");
    toast.success("Category added");
    load();
  }

  async function addTag() {
    if (!user || !newTag.trim()) return;
    await createTag(newTag.trim(), user.uid);
    setNewTag("");
    toast.success("Tag added");
    load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Categories & Tags</h1>
          <p className="text-sm text-muted-foreground">Manage the global taxonomy used to organize the library.</p>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-display text-base font-semibold">Categories</h2>
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Programming" onKeyDown={(e) => e.key === "Enter" && addCategory()} />
              <Button onClick={addCategory}><Plus className="h-4 w-4" /> Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <Badge key={c.id} variant="secondary" className="gap-1">
                  {c.name}
                  <button onClick={async () => { await deleteCategory(c.id); load(); }} aria-label={`Remove ${c.name}`}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {categories.length === 0 && <p className="text-sm text-muted-foreground">No categories yet.</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-display text-base font-semibold">Tags</h2>
            <div className="flex gap-2">
              <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="e.g. Beginner" onKeyDown={(e) => e.key === "Enter" && addTag()} />
              <Button onClick={addTag}><Plus className="h-4 w-4" /> Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <Badge key={t.id} variant="outline" className="gap-1">
                  {t.name}
                  <button onClick={async () => { await deleteTag(t.id); load(); }} aria-label={`Remove ${t.name}`}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              {tags.length === 0 && <p className="text-sm text-muted-foreground">No tags yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
