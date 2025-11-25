import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/Toast";
import {
  Household,
  HouseholdDetail,
  HouseholdListResponse,
  assignHouseholdMembers,
  createHousehold,
  getHousehold,
  listHouseholds,
} from "@/lib/api";

export type HouseholdTarget = {
  id: number;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  targets: HouseholdTarget[];
  mode: "bulk" | "single";
  onAssigned: () => void;
  ["data-tour"]?: string;
};

type HouseholdMode = "existing" | "new";

export default function HouseholdAssignDrawer({ open, onClose, targets, mode, onAssigned, ...rest }: Props) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [listLoading, setListLoading] = useState(false);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<number | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drawerMode, setDrawerMode] = useState<HouseholdMode>("existing");
  const [newHouseholdName, setNewHouseholdName] = useState("");
  const [headMemberId, setHeadMemberId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const targetsLabel = useMemo(() => {
    if (targets.length === 1) {
      return targets[0].name;
    }
    return `${targets.length} members selected`;
  }, [targets]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const combinedMembers = useMemo(() => {
    const map = new Map<number, { id: number; label: string }>();
    if (selectedHousehold) {
      selectedHousehold.members.forEach((member) => {
        const label = `${member.first_name} ${member.last_name}`.trim();
        map.set(member.id, { id: member.id, label });
      });
    }
    targets.forEach((target) => {
      if (!map.has(target.id)) {
        map.set(target.id, { id: target.id, label: target.name });
      }
    });
    return Array.from(map.values());
  }, [selectedHousehold, targets]);

  const resetDrawer = useCallback(() => {
    setSearch("");
    setPage(1);
    setSelectedHouseholdId(null);
    setSelectedHousehold(null);
    setDrawerMode("existing");
    setNewHouseholdName("");
    setHeadMemberId("");
    setError("");
    setHouseholds([]);
    setTotal(0);
  }, []);

  useEffect(() => {
    if (!open) {
      resetDrawer();
    }
  }, [open, resetDrawer]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    async function loadList() {
      setListLoading(true);
      try {
        const result: HouseholdListResponse = await listHouseholds({ q: search || undefined, page, page_size: pageSize });
        if (!cancelled) {
          setHouseholds(result.items);
          setTotal(result.total);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.push("Failed to load households");
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }
    loadList();
    return () => {
      cancelled = true;
    };
  }, [open, search, page, pageSize, toast]);

  useEffect(() => {
    if (!selectedHouseholdId || !open) {
      setSelectedHousehold(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      setDetailLoading(true);
      try {
        const detail = await getHousehold(selectedHouseholdId);
        if (!cancelled) {
          setSelectedHousehold(detail);
          if (!headMemberId && detail.head_member_id) {
            setHeadMemberId(detail.head_member_id);
          }
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.push("Failed to load household details");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedHouseholdId, open, headMemberId, toast]);

  const closeDrawer = () => {
    if (!saving) {
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!targets.length) {
      setError("Select at least one member");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (drawerMode === "new") {
        const trimmed = newHouseholdName.trim();
        if (!trimmed) {
          setError("Household name is required");
          setSaving(false);
          return;
        }
        const created = await createHousehold({
          name: trimmed,
          head_member_id: headMemberId === "" ? undefined : Number(headMemberId),
        });
        await assignHouseholdMembers(created.id, {
          member_ids: targets.map((target) => target.id),
          head_member_id: headMemberId === "" ? undefined : Number(headMemberId),
        });
        toast.push("Household created");
      } else if (selectedHouseholdId) {
        const detail = selectedHousehold ?? (await getHousehold(selectedHouseholdId));
        const combinedIds = Array.from(
          new Set<number>([
            ...detail.members.map((member) => member.id),
            ...targets.map((target) => target.id),
          ])
        );
        if (!combinedIds.length) {
          setError("Select at least one member");
          setSaving(false);
          return;
        }
        const headId =
          headMemberId === ""
            ? detail.head_member_id && combinedIds.includes(detail.head_member_id)
              ? detail.head_member_id
              : combinedIds[0]
            : Number(headMemberId);
        await assignHouseholdMembers(detail.id, {
          member_ids: combinedIds,
          head_member_id: headId,
        });
        toast.push("Household updated");
      } else {
        setError("Choose a household");
        setSaving(false);
        return;
      }
      setSaving(false);
      onAssigned();
      onClose();
    } catch (err) {
      console.error(err);
      toast.push("Failed to update household");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDrawer}
          />
          <motion.div
            className="fixed right-0 top-0 bottom-0 w-full max-w-xl bg-card border-l border-border shadow-soft z-50 p-6 overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            {...rest}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Set Household</h2>
                <p className="text-sm text-mute">
                  {mode === "single" ? "Member" : "Selection"}: {targetsLabel}
                </p>
              </div>
              <Button variant="ghost" onClick={closeDrawer}>
                Close
              </Button>
            </div>

            <div className="space-y-2 mb-4">
              <label className="text-xs uppercase text-mute">Mode</label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={drawerMode === "existing" ? "primary" : "outline"}
                  onClick={() => setDrawerMode("existing")}
                >
                  Existing household
                </Button>
                <Button
                  type="button"
                  variant={drawerMode === "new" ? "primary" : "outline"}
                  onClick={() => {
                    setDrawerMode("new");
                    setSelectedHouseholdId(null);
                    setSelectedHousehold(null);
                  }}
                >
                  Create new
                </Button>
              </div>
            </div>

            {drawerMode === "existing" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-mute">Search households</label>
                  <Input
                    placeholder="Search by name…"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
                <Card className="divide-y divide-border">
                  {listLoading && (
                    <div className="p-4 text-sm text-mute">Loading households…</div>
                  )}
                  {!listLoading && households.length === 0 && (
                    <div className="p-4 text-sm text-mute">No households found.</div>
                  )}
                  {households.map((household) => (
                    <button
                      key={household.id}
                      type="button"
                      className={`w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-accent/10 ${
                        selectedHouseholdId === household.id ? "bg-accent/10" : ""
                      }`}
                      onClick={() => {
                        setSelectedHouseholdId(household.id);
                        setDrawerMode("existing");
                      }}
                    >
                      <div>
                        <div className="font-medium">{household.name}</div>
                        <div className="text-xs text-mute">
                          {household.members_count} member{household.members_count === 1 ? "" : "s"}
                          {household.head_member_name ? ` • Head: ${household.head_member_name}` : ""}
                        </div>
                      </div>
                      {selectedHouseholdId === household.id && <span className="text-xs text-accent">Selected</span>}
                    </button>
                  ))}
                </Card>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between text-sm text-mute">
                    <span>
                      Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}>
                        Previous
                      </Button>
                      <Button variant="ghost" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
                {selectedHousehold && (
                  <div className="rounded-xl border border-border p-4 space-y-3">
                    <div className="text-sm font-medium">Members</div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {selectedHousehold.members.map((member) => (
                        <span key={member.id} className="px-3 py-1 rounded-full bg-accent/10 text-accent">
                          {member.first_name} {member.last_name}
                        </span>
                      ))}
                      {targets
                        .filter((target) => selectedHousehold.members.every((member) => member.id !== target.id))
                        .map((target) => (
                          <span key={target.id} className="px-3 py-1 rounded-full bg-primary/10 text-primary">
                            {target.name}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-mute">Household name</label>
                  <Input
                    placeholder="e.g., Negash Family"
                    value={newHouseholdName}
                    onChange={(event) => setNewHouseholdName(event.target.value)}
                  />
                </div>
                <p className="text-sm text-mute">
                  {targets.length === 1
                    ? "The selected member will be the first to join this household."
                    : "All selected members will be added to the new household."}
                </p>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <label className="text-xs uppercase text-mute">Head of household</label>
              <Select
                value={headMemberId === "" ? "" : String(headMemberId)}
                onChange={(event) => setHeadMemberId(event.target.value === "" ? "" : Number(event.target.value))}
                disabled={!combinedMembers.length}
              >
                <option value="">Auto-select</option>
                {combinedMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </Select>
            </div>

            {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

            <div className="flex justify-end gap-3 mt-6">
              <Button type="button" variant="ghost" onClick={closeDrawer} disabled={saving}>
                Cancel
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={saving}>
                {saving ? "Saving…" : "Save household"}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
