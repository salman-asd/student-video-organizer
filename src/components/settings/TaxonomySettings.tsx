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
import Link from "next/link";
import { PageInfo } from "@/components/shared/PageInfo";
import { GuideCard, GuideList, GuideSection } from "@/components/shared/GuideCard";
import { toast } from "sonner";

export function TaxonomySettings({ mode }: { mode: "categories" | "tags" }) {
  const { user } = useAuth();
  const [items, setItems] = React.useState<Array<Category | Tag>>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [name, setName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const isCategories = mode === "categories";
  const noun = isCategories ? "category" : "tag";

  const load = React.useCallback(async () => {
    if (!user) return;
    setItems(isCategories ? await listCategories(user.uid) : await listTags());
    setLoaded(true);
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
          <div className="flex items-center gap-1.5">
            <h1 className="font-display text-2xl font-semibold">{isCategories ? "Categories" : "Tags"}</h1>
            <PageInfo title={isCategories ? "Categories" : "Tags"} guideId={mode}>
              {isCategories ? (
                <>
                  <p>Categories are <strong>your own labels</strong> for grouping playlists and videos (for example &quot;Programming&quot; or &quot;Math&quot;). Only you see them.</p>
                  <p>They also become the <strong>topics you can pick as Interests</strong>, which drive your roadmap and recommendations.</p>
                </>
              ) : (
                <>
                  <p>Tags are <strong>shared labels</strong> that everyone can attach to playlists and videos to make them easier to find and filter.</p>
                  <p>Only admins manage this list. Renaming or deleting a tag affects everyone who uses it.</p>
                </>
              )}
            </PageInfo>
          </div>
          <p className="text-sm text-muted-foreground">
            Create, rename, and remove {isCategories ? "your personal categories" : "shared tags used to organize content"}.
          </p>
        </div>

        {isCategories ? (
          <GuideCard id="categories" title="How categories work" forceOpen={loaded && items.length === 0}>
            <GuideSection title="What they are for">
              <GuideList items={[
                <>A <strong>category</strong> is a personal label for a playlist or video — for example Programming, Math, Language. Each playlist/video can have one.</>,
                <>Use them to <strong>filter</strong> your Playlists and Library so you can find things quickly.</>,
                <>Every category is also a <strong>topic you can choose on the <Link href="/settings/interests" className="font-medium text-accent hover:underline">Interests</Link> page</strong>. Interests then power your Roadmap and the &quot;Recommended for you&quot; list. A topic you add on the Interests page shows up here too.</>,
              ]} />
            </GuideSection>
            <GuideSection title="How to use this page">
              <GuideList ordered items={[
                <>Type a name (e.g. &quot;Programming&quot;) and press <strong>Add</strong> or Enter.</>,
                <>Use the pencil to <strong>rename</strong> (the new name shows everywhere it is used) and ✕ to <strong>delete</strong>.</>,
                <>Then pick the category when you create or edit a playlist, or when you save a video.</>,
              ]} />
            </GuideSection>
            <GuideSection title="Good to know">
              <GuideList items={[
                <>Deleting a category <strong>does not delete</strong> any playlists or videos — they just stop showing that category. If it was one of your interests, review your Interests afterwards.</>,
                <>Keep names <strong>short and broad</strong> (&quot;Web development&quot; rather than &quot;React hooks part 2&quot;). Finer detail belongs in subtopics or tags.</>,
                <>Avoid near-duplicates (&quot;Maths&quot; and &quot;Math&quot;) — they split your filters and recommendations.</>,
              ]} />
            </GuideSection>
          </GuideCard>
        ) : (
          <GuideCard id="tags" title="How tags work" defaultOpen={false}>
            <GuideSection title="What they are for">
              <GuideList items={[
                <>Tags are <strong>shared</strong> across Study Lamp (unlike categories, which are personal). They describe content in a way anyone can search and filter by — e.g. Beginner, Exam prep, Free.</>,
                <>A playlist or video can have <strong>several</strong> tags, but only one category.</>,
                <>This page is <strong>admin-only</strong>. Renaming or deleting a tag changes it for every user who used it, so check before deleting.</>,
              ]} />
            </GuideSection>
          </GuideCard>
        )}

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