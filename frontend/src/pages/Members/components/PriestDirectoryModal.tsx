import { useEffect, useState } from "react";

import { Button, Card, Input, Select } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { useToast } from "@/components/Toast";
import { Priest, PriestUpdatePayload, archivePriest, restorePriest, updatePriest } from "@/lib/api";
import { getCanonicalCanadianPhone } from "@/lib/validation";

type Props = {
  open: boolean;
  onClose: () => void;
  priests: Priest[];
  onUpdate: (next: Priest[]) => void;
};

export default function PriestDirectoryModal({ open, onClose, priests, onUpdate }: Props) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<PriestUpdatePayload>({});
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!open) {
      setActiveId(null);
      setForm({});
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
      toast.push("Failed to update father confessor");
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
      toast.push("Failed to update status");
    } finally {
      setWorking(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setForm((prev) => ({ ...prev, phone: value }));
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
            <p className="text-sm text-mute">Manage contact details and statuses.</p>
          </div>
          <Button variant="ghost" onClick={onClose} disabled={working}>
            Close
          </Button>
        </div>
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
                  <Button
                    variant="soft"
                    onClick={() => startEdit(priest)}
                    disabled={working}
                  >
                    Edit
                  </Button>
                  <Button
                    variant={priest.status === "Inactive" ? "outline" : "destructive"}
                    onClick={() => handleArchiveToggle(priest)}
                    disabled={working}
                  >
                    {priest.status === "Inactive" ? "Restore" : "Archive"}
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
