import { useEffect, useMemo, useState } from "react";

import { Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  TaxonomyItem,
  TaxonomyItemPayload,
  createMemberMinistry,
  createMemberTag,
  deleteMemberMinistry,
  deleteMemberTag,
  parseApiErrorMessage,
  updateMemberMinistry,
  updateMemberTag,
} from "@/lib/api";

type DirectoryKind = "tags" | "ministries";
type DirectoryItem = {
  id: number;
  name: string;
  slug: string;
  members_count?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  tags: DirectoryItem[];
  ministries: DirectoryItem[];
  onUpdate: (tags: DirectoryItem[], ministries: DirectoryItem[]) => void;
};

const emptyPayload: TaxonomyItemPayload = { name: "", slug: "" };

function sortItems<T extends DirectoryItem>(items: T[]) {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

function membersCount(item: DirectoryItem) {
  return typeof item.members_count === "number" ? item.members_count : 0;
}

export default function TagMinistryDirectoryModal({ open, onClose, tags, ministries, onUpdate }: Props) {
  const toast = useToast();
  const [kind, setKind] = useState<DirectoryKind>("tags");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TaxonomyItemPayload>(emptyPayload);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<TaxonomyItemPayload>(emptyPayload);
  const [working, setWorking] = useState(false);

  const items = useMemo(() => (kind === "tags" ? sortItems(tags) : sortItems(ministries)), [kind, tags, ministries]);
  const label = kind === "tags" ? "tag" : "ministry";

  useEffect(() => {
    if (!open) {
      setKind("tags");
      setActiveId(null);
      setEditForm(emptyPayload);
      setCreateOpen(false);
      setCreateForm(emptyPayload);
      setWorking(false);
    }
  }, [open]);

  const replaceItem = (updated: TaxonomyItem) => {
    if (kind === "tags") {
      onUpdate(sortItems([...tags.filter((item) => item.id !== updated.id), updated]), ministries);
      return;
    }
    onUpdate(tags, sortItems([...ministries.filter((item) => item.id !== updated.id), updated]));
  };

  const removeItem = (removed: DirectoryItem) => {
    if (kind === "tags") {
      onUpdate(tags.filter((item) => item.id !== removed.id), ministries);
      return;
    }
    onUpdate(tags, ministries.filter((item) => item.id !== removed.id));
  };

  const startEdit = (item: DirectoryItem) => {
    setActiveId(item.id);
    setEditForm({ name: item.name, slug: item.slug });
  };

  const handleCreate = async () => {
    const name = createForm.name.trim();
    if (!name) {
      toast.push(`${label[0].toUpperCase()}${label.slice(1)} name is required`);
      return;
    }
    setWorking(true);
    try {
      const payload = { name, slug: createForm.slug?.trim() || undefined };
      const created = kind === "tags" ? await createMemberTag(payload) : await createMemberMinistry(payload);
      replaceItem(created);
      setCreateForm(emptyPayload);
      setCreateOpen(false);
      toast.push(`${label[0].toUpperCase()}${label.slice(1)} created`);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, `Failed to create ${label}`));
    } finally {
      setWorking(false);
    }
  };

  const handleSave = async () => {
    if (!activeId || !editForm.name.trim()) {
      toast.push(`${label[0].toUpperCase()}${label.slice(1)} name is required`);
      return;
    }
    setWorking(true);
    try {
      const payload = { name: editForm.name.trim(), slug: editForm.slug?.trim() || undefined };
      const updated = kind === "tags"
        ? await updateMemberTag(activeId, payload)
        : await updateMemberMinistry(activeId, payload);
      replaceItem(updated);
      setActiveId(null);
      setEditForm(emptyPayload);
      toast.push(`${label[0].toUpperCase()}${label.slice(1)} updated`);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, `Failed to update ${label}`));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (item: DirectoryItem) => {
    if (!window.confirm(`Delete ${item.name}? Assigned items cannot be deleted.`)) {
      return;
    }
    setWorking(true);
    try {
      if (kind === "tags") {
        await deleteMemberTag(item.id);
      } else {
        await deleteMemberMinistry(item.id);
      }
      removeItem(item);
      if (activeId === item.id) {
        setActiveId(null);
        setEditForm(emptyPayload);
      }
      toast.push(`${label[0].toUpperCase()}${label.slice(1)} deleted`);
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, `Failed to delete ${label}`));
    } finally {
      setWorking(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => !working && onClose()} />
      <Card className="relative z-10 w-full max-w-3xl space-y-5 overflow-y-auto p-6 max-h-[90vh]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Tags & Ministry Directory</h2>
            <p className="text-sm text-mute">Create, edit, or delete reusable tags and ministries without leaving the member workspace.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="soft" onClick={() => setCreateOpen((prev) => !prev)} disabled={working}>
              {createOpen ? "Cancel new" : `New ${label}`}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={working}>
              Close
            </Button>
          </div>
        </div>

        <div className="flex gap-2 rounded-xl border border-border bg-card/70 p-1">
          {(["tags", "ministries"] as DirectoryKind[]).map((nextKind) => (
            <button
              key={nextKind}
              type="button"
              onClick={() => {
                setKind(nextKind);
                setActiveId(null);
                setEditForm(emptyPayload);
              }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                kind === nextKind ? "bg-accent text-accent-foreground" : "text-mute hover:bg-accent/10 hover:text-ink"
              }`}
              disabled={working}
            >
              {nextKind === "tags" ? "Tags" : "Ministries"}
            </button>
          ))}
        </div>

        {createOpen && (
          <div className="space-y-3 rounded-xl border border-border bg-card/70 p-4">
            <div className="text-sm font-medium">Add {label}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase text-mute">Name</label>
                <Input
                  value={createForm.name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={working}
                  placeholder={kind === "tags" ? "New family" : "Choir"}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Slug</label>
                <Input
                  value={createForm.slug ?? ""}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, slug: event.target.value }))}
                  disabled={working}
                  placeholder="Auto-generated if blank"
                />
              </div>
            </div>
            <Button onClick={handleCreate} disabled={working}>
              {working ? "Saving..." : `Save ${label}`}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {items.length === 0 && <div className="text-sm text-mute">No {kind} available yet.</div>}
          {items.map((item) => {
            const editing = activeId === item.id;
            return (
              <div key={item.id} className="rounded-xl border border-border bg-card/70 p-4">
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs uppercase text-mute">Name</label>
                        <Input
                          value={editForm.name}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          disabled={working}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute">Slug</label>
                        <Input
                          value={editForm.slug ?? ""}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, slug: event.target.value }))}
                          disabled={working}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handleSave} disabled={working}>
                        {working ? "Saving..." : "Save changes"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setActiveId(null);
                          setEditForm(emptyPayload);
                        }}
                        disabled={working}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-ink">{item.name}</div>
                      <div className="text-xs text-mute">
                        {item.slug} · {membersCount(item)} assigned member{membersCount(item) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => startEdit(item)} disabled={working}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => handleDelete(item)} disabled={working}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
