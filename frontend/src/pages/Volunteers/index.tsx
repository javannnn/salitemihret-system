import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HandHeart, Loader2, Mail, Phone, PlusCircle, RefreshCcw, Search, Users } from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  ApiError,
  VolunteerGroup,
  VolunteerGroupUpdatePayload,
  VolunteerServiceType,
  VolunteerWorker,
  VolunteerWorkerListResponse,
  VolunteerWorkerPayload,
  createVolunteerWorker,
  listVolunteerGroups,
  listVolunteerWorkers,
  updateVolunteerGroup,
  updateVolunteerWorker,
  deleteVolunteerWorker,
} from "@/lib/api";
import { VOLUNTEER_TYPE_OPTIONS } from "@/lib/options";

const PAGE_SIZE = 12;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, index) => CURRENT_YEAR - 1 + index);
const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

type GroupModalState = {
  open: boolean;
  group: VolunteerGroup | null;
};

type GroupFormState = {
  name: string;
  team_lead_first_name: string;
  team_lead_last_name: string;
  team_lead_phone: string;
  team_lead_email: string;
};

type WorkerModalState = {
  open: boolean;
  worker: VolunteerWorker | null;
};

type WorkerFormState = {
  group_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  service_type: VolunteerServiceType | "";
  service_date: string;
  reason: string;
};

const emptyWorkerForm = (): WorkerFormState => ({
  group_id: "",
  first_name: "",
  last_name: "",
  phone: "",
  service_type: "",
  service_date: new Date().toISOString().slice(0, 10),
  reason: "",
});

const emptyGroupForm = (group: VolunteerGroup): GroupFormState => ({
  name: group.name,
  team_lead_first_name: group.team_lead_first_name ?? "",
  team_lead_last_name: group.team_lead_last_name ?? "",
  team_lead_phone: group.team_lead_phone ?? "",
  team_lead_email: group.team_lead_email ?? "",
});

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};

const formatMonth = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString(undefined, { month: "short", year: "numeric" });
};

export default function VolunteersWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const canView = permissions.viewVolunteers || permissions.manageVolunteers;
  const canManage = permissions.manageVolunteers;

  const [activeView, setActiveView] = useState<"groups" | "workers">("groups");
  const [groups, setGroups] = useState<VolunteerGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [showMissingLeadsOnly, setShowMissingLeadsOnly] = useState(false);

  const [workers, setWorkers] = useState<VolunteerWorkerListResponse | null>(null);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [workerFilters, setWorkerFilters] = useState({
    q: "",
    group_id: "",
    service_type: "",
    service_month: "",
    service_year: "",
    page: 1,
  });
  const debouncedSearch = useDebouncedValue(workerFilters.q, 350);

  const [groupModal, setGroupModal] = useState<GroupModalState>({ open: false, group: null });
  const [groupForm, setGroupForm] = useState<GroupFormState | null>(null);
  const [groupSaving, setGroupSaving] = useState(false);

  const [workerModal, setWorkerModal] = useState<WorkerModalState>({ open: false, worker: null });
  const [workerForm, setWorkerForm] = useState<WorkerFormState>(emptyWorkerForm());
  const [workerSaving, setWorkerSaving] = useState(false);
  const [workerDeletingId, setWorkerDeletingId] = useState<number | null>(null);

  const groupStats = useMemo(() => {
    const totalGroups = groups.length;
    const totalVolunteers = groups.reduce((sum, group) => sum + (group.volunteer_count || 0), 0);
    const missingLeads = groups.filter(
      (group) => !(group.team_lead_first_name || group.team_lead_last_name || group.team_lead_phone),
    ).length;
    return { totalGroups, totalVolunteers, missingLeads };
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const query = groupSearch.trim().toLowerCase();
    return groups.filter((group) => {
      if (showMissingLeadsOnly) {
        if (group.team_lead_first_name || group.team_lead_last_name || group.team_lead_phone) {
          return false;
        }
      }
      if (!query) return true;
      return group.name.toLowerCase().includes(query);
    });
  }, [groups, groupSearch, showMissingLeadsOnly]);

  useEffect(() => {
    if (!canView) return;
    setGroupsLoading(true);
    setGroupsError(null);
    listVolunteerGroups()
      .then(setGroups)
      .catch((error) => {
        console.error(error);
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
        setGroupsError("Unable to load volunteer groups.");
      })
      .finally(() => setGroupsLoading(false));
  }, [canView]);

  useEffect(() => {
    if (!canView || activeView !== "workers") return;
    setWorkersLoading(true);
    const payload = {
      page: workerFilters.page,
      page_size: PAGE_SIZE,
      group_id: workerFilters.group_id ? Number(workerFilters.group_id) : undefined,
      service_type: workerFilters.service_type ? (workerFilters.service_type as VolunteerServiceType) : undefined,
      service_month: workerFilters.service_month ? Number(workerFilters.service_month) : undefined,
      service_year: workerFilters.service_year ? Number(workerFilters.service_year) : undefined,
      q: debouncedSearch || undefined,
    };
    listVolunteerWorkers(payload)
      .then(setWorkers)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load volunteer roster.");
      })
      .finally(() => setWorkersLoading(false));
  }, [activeView, canView, debouncedSearch, toast, workerFilters]);

  const totalPages = workers ? Math.ceil(workers.total / PAGE_SIZE) : 1;

  const handleRefresh = () => {
    if (activeView === "groups") {
      setGroupsLoading(true);
      listVolunteerGroups()
        .then(setGroups)
        .catch(() => setGroupsError("Unable to load volunteer groups."))
        .finally(() => setGroupsLoading(false));
    } else {
      setWorkerFilters((prev) => ({ ...prev }));
    }
  };

  const openGroupModal = (group: VolunteerGroup) => {
    setGroupModal({ open: true, group });
    setGroupForm(emptyGroupForm(group));
  };

  const closeGroupModal = () => {
    setGroupModal({ open: false, group: null });
    setGroupForm(null);
  };

  const saveGroup = async () => {
    if (!groupModal.group || !groupForm) return;
    const payload: VolunteerGroupUpdatePayload = {
      name: groupForm.name.trim(),
      team_lead_first_name: groupForm.team_lead_first_name.trim() || null,
      team_lead_last_name: groupForm.team_lead_last_name.trim() || null,
      team_lead_phone: groupForm.team_lead_phone.trim() || null,
      team_lead_email: groupForm.team_lead_email.trim() || null,
    };
    setGroupSaving(true);
    try {
      const updated = await updateVolunteerGroup(groupModal.group.id, payload);
      setGroups((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.push("Group updated.");
      closeGroupModal();
    } catch (error) {
      console.error(error);
      toast.push("Unable to update group.");
    } finally {
      setGroupSaving(false);
    }
  };

  const openWorkerModal = (worker?: VolunteerWorker) => {
    if (worker) {
      setWorkerForm({
        group_id: String(worker.group_id),
        first_name: worker.first_name,
        last_name: worker.last_name,
        phone: worker.phone ?? "",
        service_type: worker.service_type,
        service_date: worker.service_date,
        reason: worker.reason ?? "",
      });
      setWorkerModal({ open: true, worker });
      return;
    }
    setWorkerForm(emptyWorkerForm());
    if (groups.length) {
      setWorkerForm((prev) => ({ ...prev, group_id: String(groups[0].id) }));
    }
    setWorkerModal({ open: true, worker: null });
  };

  const closeWorkerModal = () => {
    setWorkerModal({ open: false, worker: null });
    setWorkerForm(emptyWorkerForm());
  };

  const saveWorker = async () => {
    if (!workerForm.group_id || !workerForm.first_name.trim() || !workerForm.last_name.trim() || !workerForm.service_type) {
      toast.push("Complete the required fields.");
      return;
    }
    const payload: VolunteerWorkerPayload = {
      group_id: Number(workerForm.group_id),
      first_name: workerForm.first_name.trim(),
      last_name: workerForm.last_name.trim(),
      phone: workerForm.phone.trim() || null,
      service_type: workerForm.service_type as VolunteerServiceType,
      service_date: workerForm.service_date,
      reason: workerForm.reason.trim() || null,
    };
    setWorkerSaving(true);
    try {
      if (workerModal.worker) {
        await updateVolunteerWorker(workerModal.worker.id, payload);
        toast.push("Volunteer updated.");
      } else {
        await createVolunteerWorker(payload);
        toast.push("Volunteer added.");
      }
      closeWorkerModal();
      setWorkerFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Unable to save volunteer.");
    } finally {
      setWorkerSaving(false);
    }
  };

  const handleDeleteWorker = async (worker: VolunteerWorker) => {
    if (!canManage) return;
    const confirmed = window.confirm(`Remove ${worker.first_name} ${worker.last_name} from the roster?`);
    if (!confirmed) return;
    setWorkerDeletingId(worker.id);
    try {
      await deleteVolunteerWorker(worker.id);
      toast.push("Volunteer removed.");
      setWorkerFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Unable to remove volunteer.");
    } finally {
      setWorkerDeletingId(null);
    }
  };

  const selectedGroup = useMemo(() => {
    if (!workerForm.group_id) return null;
    return groups.find((group) => String(group.id) === workerForm.group_id) ?? null;
  }, [groups, workerForm.group_id]);

  const activeFilterLabel = useMemo(() => {
    if (!workerFilters.group_id) return "All groups";
    const match = groups.find((group) => String(group.id) === workerFilters.group_id);
    return match ? match.name : "Selected group";
  }, [groups, workerFilters.group_id]);

  if (!canView) {
    return (
      <div className="p-6">
        <Card className="p-6">
          <p className="text-sm text-mute">You do not have access to the Volunteer module.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Volunteers</h1>
          <p className="text-sm text-mute">Track volunteer groups, team leads, and service participation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button variant={activeView === "groups" ? "solid" : "ghost"} onClick={() => setActiveView("groups")}>
              Groups
            </Button>
            <Button variant={activeView === "workers" ? "solid" : "ghost"} onClick={() => setActiveView("workers")}>
              Volunteers
            </Button>
          </div>
          <Button variant="ghost" onClick={handleRefresh}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          {canManage && activeView === "workers" && (
            <Button onClick={() => openWorkerModal()}>
              <PlusCircle className="h-4 w-4 mr-2" /> Add volunteer
            </Button>
          )}
        </div>
      </div>

      {activeView === "groups" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Volunteer groups</p>
              <p className="text-2xl font-semibold">{groupStats.totalGroups}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Total volunteers</p>
              <p className="text-2xl font-semibold">{groupStats.totalVolunteers}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Teams missing a lead</p>
              <p className="text-2xl font-semibold">{groupStats.missingLeads}</p>
            </Card>
          </div>
          <Card className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 w-full md:max-w-md">
                <Search className="h-4 w-4 text-mute" />
                <Input
                  placeholder="Search groups"
                  value={groupSearch}
                  onChange={(event) => setGroupSearch(event.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={showMissingLeadsOnly ? "solid" : "ghost"}
                  onClick={() => setShowMissingLeadsOnly((prev) => !prev)}
                >
                  {showMissingLeadsOnly ? "Showing missing leads" : "Show missing leads"}
                </Button>
              </div>
            </div>
          </Card>
          {groupsLoading ? (
            <Card className="p-6 flex items-center gap-2 text-sm text-mute">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading volunteer groups...
            </Card>
          ) : groupsError ? (
            <Card className="p-6 text-sm text-rose-600">{groupsError}</Card>
          ) : filteredGroups.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredGroups.map((group) => {
                const leadName = [group.team_lead_first_name, group.team_lead_last_name].filter(Boolean).join(" ");
                const hasLead = Boolean(leadName || group.team_lead_phone || group.team_lead_email);
                return (
                  <Card key={group.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">{group.name}</p>
                      <Badge variant="outline">{group.volunteer_count} volunteers</Badge>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm text-mute space-y-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-mute" />
                        <span>Team lead: {leadName || "Not set"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-mute" />
                        <span>{group.team_lead_phone || "Phone not set"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-mute" />
                        <span>{group.team_lead_email || "Email not set"}</span>
                      </div>
                    </div>
                    {!hasLead && (
                      <div className="text-xs text-amber-600">
                        No team lead details yet. Add one to keep the group reachable.
                      </div>
                    )}
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openGroupModal(group)}>
                        Update team lead
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="p-6 text-sm text-mute">
              No groups match your search.
            </Card>
          )}
        </div>
      )}

      {activeView === "workers" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase text-mute">Roster snapshot</p>
                <p className="text-sm text-mute">
                  Viewing <span className="font-medium text-ink">{activeFilterLabel}</span>
                </p>
              </div>
              {selectedGroup && (
                <div className="text-xs text-mute">
                  Team lead:{" "}
                  {[selectedGroup.team_lead_first_name, selectedGroup.team_lead_last_name].filter(Boolean).join(" ") ||
                    "Not set"}
                  {selectedGroup.team_lead_phone ? ` • ${selectedGroup.team_lead_phone}` : ""}
                </div>
              )}
            </div>
          </Card>
          <Card className="p-4 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 w-full md:max-w-md">
                <Search className="h-4 w-4 text-mute" />
                <Input
                  placeholder="Search by name or phone"
                  value={workerFilters.q}
                  onChange={(event) => setWorkerFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={workerFilters.group_id}
                  onChange={(event) => setWorkerFilters((prev) => ({ ...prev, group_id: event.target.value, page: 1 }))}
                >
                  <option value="">All groups</option>
                  {groups.map((group) => (
                    <option key={group.id} value={String(group.id)}>
                      {group.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={workerFilters.service_type}
                  onChange={(event) => setWorkerFilters((prev) => ({ ...prev, service_type: event.target.value, page: 1 }))}
                >
                  <option value="">All service types</option>
                  {VOLUNTEER_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={workerFilters.service_month}
                  onChange={(event) => setWorkerFilters((prev) => ({ ...prev, service_month: event.target.value, page: 1 }))}
                >
                  <option value="">Month</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </Select>
                <Select
                  value={workerFilters.service_year}
                  onChange={(event) => setWorkerFilters((prev) => ({ ...prev, service_year: event.target.value, page: 1 }))}
                >
                  <option value="">Year</option>
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setWorkerFilters({ q: "", group_id: "", service_type: "", service_month: "", service_year: "", page: 1 })
                  }
                >
                  Reset
                </Button>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Users className="h-4 w-4 text-mute" /> Volunteer roster
              </div>
              <Badge variant="outline">{workers?.total ?? 0} total</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-mute">
                  <tr>
                    <th className="px-4 py-2 text-left">Name</th>
                    <th className="px-4 py-2 text-left">Phone</th>
                    <th className="px-4 py-2 text-left">Group</th>
                    <th className="px-4 py-2 text-left">Service type</th>
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-left">Volunteer date</th>
                    <th className="px-4 py-2 text-left">Reason</th>
                    {canManage && <th className="px-4 py-2 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {workersLoading ? (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="px-4 py-6 text-center text-sm text-mute">
                        <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                        Loading volunteers...
                      </td>
                    </tr>
                  ) : workers?.items.length ? (
                    workers.items.map((worker) => (
                      <tr key={worker.id} className="border-t border-border/60">
                        <td className="px-4 py-2 font-medium">
                          {worker.first_name} {worker.last_name}
                        </td>
                        <td className="px-4 py-2">{worker.phone || "—"}</td>
                        <td className="px-4 py-2">{worker.group.name}</td>
                        <td className="px-4 py-2">
                          {VOLUNTEER_TYPE_OPTIONS.find((option) => option.value === worker.service_type)?.label ||
                            worker.service_type}
                        </td>
                        <td className="px-4 py-2">{formatMonth(worker.service_date)}</td>
                        <td className="px-4 py-2">{formatDate(worker.service_date)}</td>
                        <td className="px-4 py-2">{worker.reason || "—"}</td>
                        {canManage && (
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="ghost" onClick={() => openWorkerModal(worker)}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={workerDeletingId === worker.id}
                                onClick={() => handleDeleteWorker(worker)}
                              >
                                {workerDeletingId === worker.id ? "Removing..." : "Remove"}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="px-4 py-6 text-center text-sm text-mute">
                        No volunteers found. Try adjusting the filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={workerFilters.page <= 1}
              onClick={() => setWorkerFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
            >
              Previous
            </Button>
            <span className="text-xs text-mute">
              Page {workerFilters.page} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={workerFilters.page >= totalPages}
              onClick={() => setWorkerFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {groupModal.open && groupForm && groupModal.group && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeGroupModal}
            />
            <motion.div
              className="fixed inset-x-0 top-24 mx-auto w-full max-w-lg bg-card border border-border rounded-2xl z-50 p-6 space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Update team lead</h3>
                <Button variant="ghost" onClick={closeGroupModal}>
                  Close
                </Button>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-mute">
                  Update group name only if the group has been renamed officially.
                </p>
                <Input
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((prev) => prev && ({ ...prev, name: event.target.value }))}
                  placeholder="Group name"
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={groupForm.team_lead_first_name}
                    onChange={(event) =>
                      setGroupForm((prev) => prev && ({ ...prev, team_lead_first_name: event.target.value }))
                    }
                    placeholder="Team lead first name"
                  />
                  <Input
                    value={groupForm.team_lead_last_name}
                    onChange={(event) =>
                      setGroupForm((prev) => prev && ({ ...prev, team_lead_last_name: event.target.value }))
                    }
                    placeholder="Team lead last name"
                  />
                </div>
                <Input
                  value={groupForm.team_lead_phone}
                  onChange={(event) =>
                    setGroupForm((prev) => prev && ({ ...prev, team_lead_phone: event.target.value }))
                  }
                  placeholder="Team lead phone"
                />
                <Input
                  value={groupForm.team_lead_email}
                  onChange={(event) =>
                    setGroupForm((prev) => prev && ({ ...prev, team_lead_email: event.target.value }))
                  }
                  placeholder="Team lead email (optional)"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeGroupModal}>
                  Cancel
                </Button>
                <Button onClick={saveGroup} disabled={groupSaving}>
                  {groupSaving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {workerModal.open && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeWorkerModal}
            />
            <motion.div
              className="fixed inset-x-0 top-24 mx-auto w-full max-w-2xl bg-card border border-border rounded-2xl z-50 p-6 space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {workerModal.worker ? "Edit volunteer" : "Add volunteer"}
                </h3>
                <Button variant="ghost" onClick={closeWorkerModal}>
                  Close
                </Button>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <Select
                    value={workerForm.group_id}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, group_id: event.target.value }))}
                  >
                    <option value="">Select group</option>
                    {groups.map((group) => (
                      <option key={group.id} value={String(group.id)}>
                        {group.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={workerForm.service_type}
                    onChange={(event) =>
                      setWorkerForm((prev) => ({ ...prev, service_type: event.target.value as VolunteerServiceType }))
                    }
                  >
                    <option value="">Service type</option>
                    {VOLUNTEER_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={workerForm.first_name}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, first_name: event.target.value }))}
                    placeholder="First name"
                  />
                  <Input
                    value={workerForm.last_name}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, last_name: event.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input
                    value={workerForm.phone}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, phone: event.target.value }))}
                    placeholder="Phone number"
                  />
                  <Input
                    type="date"
                    value={workerForm.service_date}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, service_date: event.target.value }))}
                  />
                </div>
                {selectedGroup && (
                  <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-mute flex items-center gap-2">
                    <HandHeart className="h-4 w-4 text-mute" />
                    Team lead: {[selectedGroup.team_lead_first_name, selectedGroup.team_lead_last_name].filter(Boolean).join(" ") || "Not set"}
                    {selectedGroup.team_lead_phone ? ` • ${selectedGroup.team_lead_phone}` : ""}
                  </div>
                )}
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Reason / Notes</label>
                  <Textarea
                    rows={3}
                    value={workerForm.reason}
                    onChange={(event) => setWorkerForm((prev) => ({ ...prev, reason: event.target.value }))}
                    placeholder="Reason (free text)"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={closeWorkerModal}>
                  Cancel
                </Button>
                <Button onClick={saveWorker} disabled={workerSaving}>
                  {workerSaving ? "Saving..." : workerModal.worker ? "Save changes" : "Add volunteer"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
