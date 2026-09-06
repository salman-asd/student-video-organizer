"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPersonalPlaylist } from "@/lib/firestore/personalPlaylists";
import type { PersonalPlaylistVisibility } from "@/types";
import { toast } from "sonner";
import { TagCategoryPicker } from "@/components/shared/TagCategoryPicker";

const VISIBILITY_LABELS: Record<PersonalPlaylistVisibility, string> = {
  private: "Private",
  link: "Anyone with link",
  public: "Public",
};

export function QuickAddPlaylistDialog({ ownerId, open, onOpenChange, onCreated }: {
  ownerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [visibility, setVisibility] = React.useState<PersonalPlaylistVisibility>("private");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setTitle("");
    setDescription("");
    setVisibility("private");
    setCategoryId(null);
    setTagIds([]);
    setSaving(false);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createPersonalPlaylist(ownerId, title.trim(), description.trim(), visibility, categoryId, tagIds);
      toast.success("Playlist created");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      toast.error(error?.message || "Unable to create playlist.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Playlist</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. My Interview Prep" />
          </div>
          <TagCategoryPicker userId={ownerId} categoryId={categoryId} tagIds={tagIds} onCategoryChange={setCategoryId} onTagsChange={setTagIds} />
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(value) => setVisibility(value as PersonalPlaylistVisibility)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Visibility" /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VISIBILITY_LABELS) as PersonalPlaylistVisibility[]).map((value) => (
                  <SelectItem key={value} value={value}>{VISIBILITY_LABELS[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving || !title.trim()}>{saving ? "Creating..." : "Create playlist"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
