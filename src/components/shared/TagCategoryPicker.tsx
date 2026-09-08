"use client";

import * as React from "react";
import { listCategories, listTags, createCategoryIfMissing, createTagIfMissing, deleteCategory, updateCategory } from "@/lib/firestore/categoriesTags";
import type { Category, Tag } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronDown, Pencil, Trash2, X } from "lucide-react";

export function TagCategoryPicker({
  userId, categoryId, tagIds, onCategoryChange, onTagsChange,
}: {
  userId: string;
  categoryId?: string | null;
  tagIds: string[];
  onCategoryChange: (value: string | null) => void;
  onTagsChange: (value: string[]) => void;
}) {
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [categoryQuery, setCategoryQuery] = React.useState("");
  const [tagQuery, setTagQuery] = React.useState("");
  const [categoryOpen, setCategoryOpen] = React.useState(false);
  const [tagOpen, setTagOpen] = React.useState(false);

  React.useEffect(() => {
    Promise.all([listCategories(userId), listTags()]).then(([nextCategories, nextTags]) => {
      setCategories(nextCategories);
      setTags(nextTags);
    }).catch(() => {});
  }, [userId]);

  React.useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setCategoryOpen(false);
        setTagOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  const selectedTags = tags.filter((tag) => tagIds.includes(tag.id));
  const normalizedCategoryQuery = categoryQuery.trim().toLowerCase();
  const normalizedTagQuery = tagQuery.trim().toLowerCase();
  const categoryMatches = categories.filter((category) => category.name.toLowerCase().includes(normalizedCategoryQuery));
  const tagMatches = tags.filter((tag) => tag.name.toLowerCase().includes(normalizedTagQuery));
  const exactCategoryMatch = categories.some((category) => category.name.trim().toLowerCase() === normalizedCategoryQuery);
  const exactTagMatch = tags.some((tag) => tag.name.trim().toLowerCase() === normalizedTagQuery);

  const selectedCategory = categories.find((category) => category.id === categoryId);

  async function addCategory(name: string) {
    const id = await createCategoryIfMissing(name, userId);
    const nextCategories = await listCategories(userId);
    setCategories(nextCategories);
    onCategoryChange(id);
    setCategoryQuery("");
    setCategoryOpen(false);
  }

  async function editCategory(category: Category) {
    const nextName = window.prompt("Rename category", category.name)?.trim();
    if (!nextName || nextName === category.name) return;
    try {
      await updateCategory(userId, category.id, nextName);
      setCategories(await listCategories(userId));
    } catch (error: any) {
      window.alert(error?.message || "Unable to rename category.");
    }
  }

  async function removeCategory(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"? Existing videos and playlists will keep their category ID.`)) return;
    await deleteCategory(userId, category.id);
    if (category.id === categoryId) onCategoryChange(null);
    setCategories((current) => current.filter((item) => item.id !== category.id));
  }

  async function addTag(name: string) {
    const id = await createTagIfMissing(name, userId);
    const nextTags = await listTags();
    setTags(nextTags);
    if (!tagIds.includes(id)) onTagsChange([...tagIds, id]);
    setTagQuery("");
    setTagOpen(false);
  }

  return (
    <div ref={pickerRef} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="space-y-1.5">
        <Label>Category (optional)</Label>
        <div className="relative">
          <button type="button" className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm" onClick={() => setCategoryOpen((open) => !open)}>
            <span className={selectedCategory ? "text-foreground" : "text-muted-foreground"}>{selectedCategory?.name || "Choose or create a category"}</span><ChevronDown className="h-4 w-4" />
          </button>
          {categoryOpen && <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-2 shadow-md">
            <Input autoFocus value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Search categories" />
            <div className="mt-1 max-h-40 overflow-y-auto">
              <button type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary" onClick={() => { onCategoryChange(null); setCategoryOpen(false); }}>None{!categoryId && <Check className="h-4 w-4" />}</button>
              {categoryMatches.map((category) => <div key={category.id} className="flex items-center rounded hover:bg-secondary"><button type="button" className="flex min-w-0 flex-1 items-center justify-between px-2 py-1.5 text-left text-sm" onClick={() => { onCategoryChange(category.id); setCategoryOpen(false); }}><span className="truncate">{category.name}</span>{category.id === categoryId && <Check className="h-4 w-4" />}</button><button type="button" className="p-1.5 text-muted-foreground hover:text-foreground" aria-label={`Rename ${category.name}`} onClick={() => editCategory(category)}><Pencil className="h-3 w-3" /></button><button type="button" className="p-1.5 text-muted-foreground hover:text-destructive" aria-label={`Delete ${category.name}`} onClick={() => removeCategory(category)}><Trash2 className="h-3 w-3" /></button></div>)}
              {categoryQuery.trim() && !exactCategoryMatch && <Button type="button" variant="ghost" size="sm" className="mt-1 w-full justify-start text-accent" onClick={() => addCategory(categoryQuery)}>Create &quot;{categoryQuery.trim()}&quot;</Button>}
              {!categoryMatches.length && !categoryQuery.trim() && <p className="px-2 py-2 text-sm text-muted-foreground">No categories yet.</p>}
            </div>
          </div>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Tags (optional)</Label>
        <div className="flex flex-wrap gap-1.5">{selectedTags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}<button type="button" className="ml-1" onClick={() => onTagsChange(tagIds.filter((id) => id !== tag.id))}><X className="h-3 w-3" /></button></Badge>)}</div>
        <div className="relative">
          <Input value={tagQuery} onFocus={() => setTagOpen(true)} onChange={(event) => { setTagQuery(event.target.value); setTagOpen(true); }} placeholder="Search or create tags" />
          {tagOpen && <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {tagMatches.filter((tag) => !tagIds.includes(tag.id)).map((tag) => <button key={tag.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary" onClick={() => onTagsChange([...tagIds, tag.id])}>{tag.name}<span className="text-xs text-muted-foreground">Add</span></button>)}
            {tagQuery.trim() && !exactTagMatch && <Button type="button" variant="ghost" size="sm" className="w-full justify-start text-accent" onClick={() => addTag(tagQuery)}>Create &quot;{tagQuery.trim()}&quot;</Button>}
            {!tagMatches.length && !tagQuery.trim() && <p className="px-2 py-2 text-sm text-muted-foreground">Search tags to add them.</p>}
          </div>}
        </div>
      </div>
    </div>
  );
}

export function SearchableTagMultiSelect({
  tags, selectedTagIds, onChange,
}: {
  tags: Tag[];
  selectedTagIds: string[];
  onChange: (value: string[]) => void;
}) {
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = tags.filter((tag) => tag.name.toLowerCase().includes(normalizedQuery));
  const selectedTags = tags.filter((tag) => selectedTagIds.includes(tag.id));

  React.useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  function toggleTag(tagId: string) {
    onChange(selectedTagIds.includes(tagId) ? selectedTagIds.filter((id) => id !== tagId) : [...selectedTagIds, tagId]);
  }

  return (
    <div ref={pickerRef} className="relative min-w-64">
      <div className="flex min-h-10 flex-wrap items-center gap-1 rounded-md border border-input bg-background p-1.5">
        {selectedTags.map((tag) => <Badge key={tag.id} variant="secondary">{tag.name}<button type="button" className="ml-1" aria-label={`Remove ${tag.name}`} onClick={() => toggleTag(tag.id)}><X className="h-3 w-3" /></button></Badge>)}
        <Input value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }} placeholder={selectedTags.length ? "Add tag" : "Search tags"} className="h-7 min-w-28 flex-1 border-0 p-0 shadow-none focus-visible:ring-0" />
      </div>
      {open && <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
        <button type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary" onClick={() => onChange([])}>All tags{selectedTagIds.length === 0 && <Check className="h-4 w-4" />}</button>
        {matches.map((tag) => <button key={tag.id} type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-secondary" onClick={() => toggleTag(tag.id)}>{tag.name}{selectedTagIds.includes(tag.id) && <Check className="h-4 w-4" />}</button>)}
        {!matches.length && <p className="px-2 py-2 text-sm text-muted-foreground">No matching tags.</p>}
      </div>}
    </div>
  );
}
