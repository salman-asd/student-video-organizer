"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, SlidersHorizontal } from "lucide-react";
import type { Category, HomeFilters, Playlist, SortOption, Tag } from "@/types";
import { SORT_LABELS } from "@/types";

interface Props {
  playlists: Playlist[];
  categories: Category[];
  tags: Tag[];
  filters: HomeFilters;
  sort: SortOption;
  onFiltersChange: (f: HomeFilters) => void;
  onSortChange: (s: SortOption) => void;
}

const ALL = "__all__";

export function FilterBar({ playlists, categories, tags, filters, sort, onFiltersChange, onSortChange }: Props) {
  const activeCount = [
    filters.playlistId, filters.categoryId, filters.tagId, filters.status,
    filters.favoriteOnly, filters.watchLaterOnly, filters.priority,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
        </span>

        <div className="grid w-full gap-2 sm:grid-cols-2 md:flex md:w-auto md:flex-wrap md:items-center">
          <Select value={filters.playlistId || ALL} onValueChange={(v) => onFiltersChange({ ...filters, playlistId: v === ALL ? null : v })}>
            <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="Playlist" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All playlists</SelectItem>
              {playlists.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.categoryId || ALL} onValueChange={(v) => onFiltersChange({ ...filters, categoryId: v === ALL ? null : v })}>
            <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.tagId || ALL} onValueChange={(v) => onFiltersChange({ ...filters, tagId: v === ALL ? null : v })}>
            <SelectTrigger className="w-full md:w-32"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All tags</SelectItem>
              {tags.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.status || ALL} onValueChange={(v) => onFiltersChange({ ...filters, status: v === ALL ? null : (v as any) })}>
            <SelectTrigger className="w-full md:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any status</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.priority || ALL} onValueChange={(v) => onFiltersChange({ ...filters, priority: v === ALL ? null : (v as any) })}>
            <SelectTrigger className="w-full md:w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any priority</SelectItem>
              <SelectItem value="high">🔴 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🟢 Low</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={filters.favoriteOnly ? "accent" : "outline"}
            size="sm"
            className="w-full md:w-auto"
            onClick={() => onFiltersChange({ ...filters, favoriteOnly: !filters.favoriteOnly })}
          >
            Favorites
          </Button>
          <Button
            variant={filters.watchLaterOnly ? "accent" : "outline"}
            size="sm"
            className="w-full md:w-auto"
            onClick={() => onFiltersChange({ ...filters, watchLaterOnly: !filters.watchLaterOnly })}
          >
            Watch Later
          </Button>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" className="w-full md:w-auto" onClick={() => onFiltersChange({ query: filters.query })}>
              <X className="h-3.5 w-3.5" /> Clear ({activeCount})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Select value={sort} onValueChange={(v) => onSortChange(v as SortOption)}>
            <SelectTrigger className="w-full md:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeCount > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.playlistId && <FilterChip label={playlists.find((p) => p.id === filters.playlistId)?.title || ""} onRemove={() => onFiltersChange({ ...filters, playlistId: null })} />}
          {filters.categoryId && <FilterChip label={categories.find((c) => c.id === filters.categoryId)?.name || ""} onRemove={() => onFiltersChange({ ...filters, categoryId: null })} />}
          {filters.tagId && <FilterChip label={tags.find((t) => t.id === filters.tagId)?.name || ""} onRemove={() => onFiltersChange({ ...filters, tagId: null })} />}
          {filters.status && <FilterChip label={filters.status.replace("_", " ")} onRemove={() => onFiltersChange({ ...filters, status: null })} />}
          {filters.priority && <FilterChip label={`${filters.priority} priority`} onRemove={() => onFiltersChange({ ...filters, priority: null })} />}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="cursor-pointer" onClick={onRemove}>
      {label} <X className="h-3 w-3" />
    </Badge>
  );
}
