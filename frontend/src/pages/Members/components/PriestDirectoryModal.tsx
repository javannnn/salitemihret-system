import { useEffect, useState } from "react";

import { Button, Card, Input, Select } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/components/Toast";
import {
  Priest,
  PriestPayload,
  PriestUpdatePayload,
  archivePriest,
  createPriest,
  deletePriest,
  parseApiErrorMessage,
  restorePriest,
  updatePriest,
} from "@/lib/api";
import { getCanonicalCanadianPhone } from "@/lib/validation";

type Props = {
  open: boolean;
  onClose: () => void;
  priests: Priest[];
  onUpdate: (next: Priest[]) => void;
  selectedPriestId?: number | null;
  onSelectPriest?: (priest: Priest) => void;
};

export default function PriestDirectoryModal({
  open,
  onClose,
  priests,
  onUpdate,
  selectedPriestId = null,
  onSelectPriest,
}: Props) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<PriestUpdatePayload>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<PriestPayload>({
    full_name: "",
    phone: "",
    email: "",
    status: "Active",
  });
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveId(null);
      setForm({});
      setCreateOpen(false);
      setCreateForm({
        full_name: "",
        phone: "",
        email: "",
        status: "Active",
      });
      setWorking(false);
    }
  }, [open]);

  const startEdit = (priest: Priest) => {
    setActiveId(priest.id);
    setForm({
      full_name: priest.full_name,
      phone: priest.phone ?? "",
      email: priest.email ?? "",
      status: priest.status,
    });
  };

  const handleSave = async () => {
    if (!activeId || !form.full_name?.trim()) {
      toast.push("Full name is required");
      return;
    }
    const canonicalPhone = form.phone ? getCanonicalCanadianPhone(form.phone) : null;
    if (form.phone && !canonicalPhone) {
      toast.push("Phone must match +1########## format.");
      return;
    }
    setWorking(true);
    try {
      const updated = await updatePriest(activeId, {
        full_name: form.full_name.trim(),
        phone: canonicalPhone ?? undefined,
        email: form.email || undefined,
        status: form.status,
      });
      onUpdate(
        [...priests.filter((item) => item.id !== updated.id), updated].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      toast.push("Father confessor updated");
      setWorking(false);
      setActiveId(null);
      setForm({});
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to update father confessor"));
      setWorking(false);
    }
  };

  const handleCreate = async () => {
    const fullName = createForm.full_name.trim();
    if (!fullName) {
      toast.push("Full name is required");
      return;
    }
    const canonicalPhone = createForm.phone ? getCanonicalCanadianPhone(createForm.phone) : null;
    if (createForm.phone && !canonicalPhone) {
      toast.push("Phone must match +1########## format.");
      return;
    }
    setWorking(true);
    try {
      const created = await createPriest({
        full_name: fullName,
        phone: canonicalPhone ?? undefined,
        email: createForm.email?.trim() || undefined,
        status: createForm.status || "Active",
      });
      onUpdate(
        [...priests.filter((item) => item.id !== created.id), created].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      onSelectPriest?.(created);
      toast.push("Father confessor created");
      setCreateOpen(false);
      setCreateForm({
        full_name: "",
        phone: "",
        email: "",
        status: "Active",
      });
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to create father confessor"));
    } finally {
      setWorking(false);
    }
  };

  const handleArchiveToggle = async (priest: Priest) => {
    setWorking(true);
    try {
      const next = priest.status === "Inactive" ? await restorePriest(priest.id) : await archivePriest(priest.id);
      onUpdate(
        [...priests.filter((item) => item.id !== next.id), next].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        )
      );
      toast.push(next.status === "Inactive" ? "Father confessor archived" : "Father confessor restored");
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to update status"));
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async (priest: Priest) => {
    if (!window.confirm(`Delete ${priest.full_name}? This cannot be undone.`)) {
      return;
    }
    setWorking(true);
    try {
      await deletePriest(priest.id);
      onUpdate(priests.filter((item) => item.id !== priest.id));
      if (activeId === priest.id) {
        setActiveId(null);
        setForm({});
      }
      toast.push("Father confessor deleted");
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Failed to delete father confessor"));
    } finally {
      setWorking(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, phone: value }));
  };

  const handleCreatePhoneChange = (value: string) => {
    setCreateForm((prev) => ({ ...prev, phone: value }));
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => !working && onClose()} />
      <Card className="relative z-10 w-full max-w-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Father Confessor Directory</h2>
            <p className="text-sm text-mute">
              Create, edit, archive, restore, or delete father confessor records.
              {onSelectPriest ? " You can also assign one to this member here." : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="soft"
              onClick={() => setCreateOpen((prev) => !prev)}
              disabled={working}
            >
              {createOpen ? "Cancel new" : "New father confessor"}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={working}>
              Close
            </Button>
          </div>
        </div>
        {createOpen && (
          <div className="space-y-3 rounded-xl border border-border bg-card/70 p-4">
            <div className="text-sm font-medium">Add father confessor</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs uppercase text-mute">Full name</label>
                <Input
                  value={createForm.full_name}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, full_name: event.target.value }))}
                  disabled={working}
                  placeholder="Abba Kidus"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Phone</label>
                <PhoneInput value={createForm.phone ?? ""} onChange={handleCreatePhoneChange} disabled={working} />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Email</label>
                <Input
                  type="email"
                  value={createForm.email ?? ""}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                  disabled={working}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-mute">Status</label>
                <Select
                  value={createForm.status ?? "Active"}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                  disabled={working}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                  <option value="OnLeave">On leave</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={handleCreate} disabled={working}>
                {working ? "Saving…" : "Save father confessor"}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {priests.length === 0 && <div className="text-sm text-mute">No father confessors yet.</div>}
          {priests.map((priest) => (
            <div key={priest.id} className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{priest.full_name}</div>
                  <div className="text-xs text-mute">
                    {priest.status} {priest.phone ? `• ${priest.phone}` : ""} {priest.email ? `• ${priest.email}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  {onSelectPriest && (
                    <Button
                      variant={selectedPriestId === priest.id ? "soft" : "ghost"}
                      onClick={() => onSelectPriest(priest)}
                      disabled={working}
                    >
                      {selectedPriestId === priest.id ? "Selected" : "Use for member"}
                    </Button>
                  )}
                  <Button
                    variant="soft"
                    onClick={() => startEdit(priest)}
                    disabled={working}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={priest.status === "Inactive" ? "ghost" : "soft"}
                    className={
                      priest.status === "Inactive"
                        ? ""
                        : "border-red-500 text-red-700 hover:bg-red-50"
                    }
                    onClick={() => handleArchiveToggle(priest)}
                    disabled={working}
                  >
                    {priest.status === "Inactive" ? "Restore" : "Archive"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(priest)}
                    disabled={working}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {activeId === priest.id && (
                <div className="space-y-3 border-t border-dashed border-border pt-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute">Full name</label>
                      <Input
                        value={form.full_name ?? ""}
                        onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                        disabled={working}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Status</label>
                      <Select
                        value={form.status ?? "Active"}
                        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                        disabled={working}
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="OnLeave">On leave</option>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs uppercase text-mute">Phone</label>
                      <PhoneInput value={form.phone ?? ""} onChange={handlePhoneChange} disabled={working} />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute">Email</label>
                      <Input
                        type="email"
                        value={form.email ?? ""}
                        onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                        disabled={working}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setActiveId(null);
                        setForm({});
                      }}
                      disabled={working}
                    >
                      Cancel
                    </Button>
                    <Button type="button" onClick={handleSave} disabled={working}>
                      {working ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
