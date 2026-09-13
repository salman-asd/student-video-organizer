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
import {
  approveCategorySuggestion,
  listCategorySuggestions,
  rejectCategorySuggestion,
} from "@/lib/firestore/categorySuggestions";
import type { Category, CategorySuggestion, Tag } from "@/types";
import { Plus, X, Check, Ban } from "lucide-react";
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
  const [suggestions, setSuggestions] = React.useState<CategorySuggestion[]>([]);

  const load = React.useCallback(async () => {
    if (!user) return;
    const [nextCategories, nextTags, nextSuggestions] = await Promise.all([
      listCategories(user.uid),
      listTags(),
      listCategorySuggestions("pending"),
    ]);
    setCategories(nextCategories);
    setTags(nextTags);
    setSuggestions(nextSuggestions);
  }, [user]);

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

  async function handleApprove(suggestion: CategorySuggestion) {
    if (!user) return;
    await approveCategorySuggestion(suggestion.id, user.uid);
    toast.success(`Approved “${suggestion.aiCleanedName || suggestion.suggestedName}”`);
    await load();
  }

  async function handleReject(suggestion: CategorySuggestion) {
    await rejectCategorySuggestion(suggestion.id);
    toast.success("Suggestion rejected");
    await load();
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Categories & Tags</h1>
          <p className="text-sm text-muted-foreground">Manage your categories and the shared tags used to organize content.</p>
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
                  <button onClick={async () => { if (user) await deleteCategory(user.uid, c.id); load(); }} aria-label={`Remove ${c.name}`}><X className="h-3 w-3" /></button>
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

        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-display text-base font-semibold">Pending category suggestions</h2>
            {suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions waiting for review.</p>
            ) : (
              <div className="space-y-2">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="flex flex-col gap-2 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-medium">{suggestion.aiCleanedName || suggestion.suggestedName}</div>
                      <p className="text-xs text-muted-foreground">From: {suggestion.suggestedName}</p>
                      {suggestion.similarExistingCategoryId && <p className="text-xs text-muted-foreground">Looks similar to an existing category.</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handleApprove(suggestion)}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void handleReject(suggestion)}>
                        <Ban className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
