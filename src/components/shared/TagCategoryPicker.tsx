"use client";

import * as React from "react";
import { listCategories, listTags, createTagIfMissing } from "@/lib/firestore/categoriesTags";
import type { Category, Tag } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X } from "lucide-react";

export function TagCategoryPicker({
  userId, categoryId, tagIds, onCategoryChange, onTagsChange,
}: {
  userId: string;
  categoryId?: string | null;
  tagIds: string[];
  onCategoryChange: (value: string | null) => void;
  onTagsChange: (value: string[]) => void;
}) {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = React.useState("");

  React.useEffect(() => {
    Promise.all([listCategories(), listTags()]).then(([nextCategories, nextTags]) => {
      setCategories(nextCategories);
      setTags(nextTags);
    }).catch(() => {});
  }, []);

  const selectedTags = tags.filter((tag) => tagIds.includes(tag.id));
  const normalizedQuery = tagQuery.trim().toLowerCase();
  const matches = tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  const exactMatch = tags.some((tag) => tag.name.toLowerCase() === normalizedQuery);

  async function addTag(name: string) {
    const id = await createTagIfMissing(name, userId);
    const nextTags = await listTags();
    setTags(nextTags);
    if (!tagIds.includes(id)) onTagsChange([...tagIds, id]);
    setTagQuery("");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label>Category (optional)</Label>
        <Select value={categoryId || "none"} onValueChange={(value) => onCategoryChange(value === "none" ? null : value)}>
          <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Tags (optional)</Label>
        <div className="flex flex-wrap gap-1.5">{selectedTags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}<button type="button" className="ml-1" onClick={() => onTagsChange(tagIds.filter((id) => id !== tag.id))}><X className="h-3 w-3" /></button></Badge>)}</div>
        <Input value={tagQuery} onChange={(event) => setTagQuery(event.target.value)} placeholder="Search or create a tag" />
        {tagQuery.trim() && <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-background p-1">
          {matches.filter((tag) => !tagIds.includes(tag.id)).map((tag) => <Button key={tag.id} type="button" variant="ghost" size="sm" className="w-full justify-start" onClick={() => onTagsChange([...tagIds, tag.id])}>{tag.name}</Button>)}
          {!exactMatch && <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-accent" onClick={() => addTag(tagQuery)}>Create “{tagQuery.trim()}”</Button>}
        </div>}
      </div>
    </div>
  );
}
