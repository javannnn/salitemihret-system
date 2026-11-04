import { Archive, Building2, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, Button, Input, Select } from "@/components/ui";
import {
  createParishCouncilDepartment,
  updateParishCouncilDepartment,
  type ParishCouncilMeta,
} from "@/lib/api";

type Department = ParishCouncilMeta["departments"][number];

export function DepartmentManager({ departments, canChangeStatus, onClose, onChange }: {
  departments: Department[];
  canChangeStatus: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState(departments);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [name, setName] = useState("");
  const [pending, setPending] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const active = items.filter((item) => item.status === "Active").length;
  const visible = items.filter((item) =>
    (filter === "all" || item.status === filter) &&
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name));

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (busy || (!pending && !name.trim())) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = pending
        ? await updateParishCouncilDepartment(pending.id, { status: pending.status === "Active" ? "Inactive" : "Active" })
        : await createParishCouncilDepartment(name.trim());
      setItems((current) => [...current.filter((item) => item.id !== updated.id), updated]);
      setNotice(`${updated.name} ${pending ? updated.status === "Active" ? "restored" : "archived" : "added"}.`);
      if (!pending) {
        setName("");
        setSearch("");
        setFilter("all");
      }
      setPending(null);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the department. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="department-manager-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-0 text-ink shadow-2xl backdrop:bg-slate-950/60">
      <header className="flex items-start justify-between gap-4 border-b border-border bg-bg p-5 sm:p-6">
        <div>
          <h2 id="department-manager-title" className="flex items-center gap-2 text-xl font-semibold"><Building2 size={22} /> Manage Departments</h2>
          <p className="mt-2 text-sm text-muted">Choose which departments appear when assigning trainees. Archiving keeps their assignments, documents, and history.</p>
        </div>
        <Button variant="ghost" aria-label="Close department manager" disabled={busy} onClick={onClose}><X size={18} /></Button>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <form onSubmit={(event) => void save(event)} className="rounded-xl border border-border bg-bg/60 p-4">
          <label htmlFor="new-council-department" className="mb-2 block text-sm font-semibold">New department</label>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Input id="new-council-department" className="min-w-0 flex-1" value={name} maxLength={150} required
              placeholder="e.g. Community Outreach" onChange={(event) => setName(event.target.value)} disabled={busy || !!pending} />
            <Button type="submit" disabled={busy || !!pending || !name.trim()}><Plus size={16} /> Add department</Button>
          </div>
          <p className="mt-2 text-xs text-muted">New departments are active. You can adjust the default minimum trainee age of 13 in department settings.</p>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <Input className="pl-9" aria-label="Search departments" placeholder="Search departments" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select className="w-auto" aria-label="Filter departments by status" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All ({items.length})</option>
            <option value="Active">Active ({active})</option>
            <option value="Inactive">Archived ({items.length - active})</option>
          </Select>
        </div>
        {error && <p role="alert" className="rounded-lg border border-red-400/40 p-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted">{notice}</p>}
        {pending && (
          <section className="space-y-3 rounded-xl border border-border bg-bg p-4" aria-label="Confirm department change">
            <p className="font-semibold">{pending.status === "Active" ? "Archive" : "Restore"} {pending.name}?</p>
            <p className="text-sm text-muted">{pending.status === "Active"
              ? "Staff can still view and update existing assignments. This department will be hidden for new assignments."
              : "This department will be available for new trainee assignments again."}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => { setPending(null); setError(""); }}>Cancel</Button>
              <Button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : pending.status === "Active" ? "Archive department" : "Restore department"}</Button>
            </div>
          </section>
        )}
        <ul className="divide-y divide-border rounded-xl border border-border">
          {visible.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{item.name}</p>
                <Badge>{item.status === "Active" ? "Active" : "Archived"}</Badge>
              </div>
              {canChangeStatus && <Button variant="ghost" disabled={busy || !!pending}
                aria-label={`${item.status === "Active" ? "Archive" : "Restore"} ${item.name}`}
                onClick={() => { setPending(item); setError(""); setNotice(""); }}>
                {item.status === "Active" ? <Archive size={16} /> : <RotateCcw size={16} />}
                {item.status === "Active" ? "Archive" : "Restore"}
              </Button>}
            </li>
          ))}
          {!visible.length && <li className="p-6 text-center text-sm text-muted">No departments match this view.</li>}
        </ul>
      </div>
    </dialog>
  );
}
