import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, Phone, ShieldAlert, UserCheck } from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  ApiError,
  Newcomer,
  NewcomerAddressHistoryListResponse,
  NewcomerInteraction,
  NewcomerInteractionListResponse,
  NewcomerTimelineResponse,
  StaffSummary,
  convertNewcomer,
  createNewcomerInteraction,
  getNewcomer,
  getNewcomerTimeline,
  inactivateNewcomer,
  listNewcomerAddressHistory,
  listNewcomerInteractions,
  listStaff,
  reactivateNewcomer,
  transitionNewcomerStatus,
  updateNewcomer,
} from "@/lib/api";
import { MEMBER_STATUS_OPTIONS } from "@/lib/options";

type StatusModalState = {
  open: boolean;
  mode: "settle" | "reopen" | "inactivate" | "reactivate" | null;
};

const STATUS_FLOW: Newcomer["status"][] = [
  "New",
  "Contacted",
  "Assigned",
  "InProgress",
  "Settled",
  "Closed",
];

const STATUS_BADGE_STYLES: Record<Newcomer["status"], string> = {
  New: "bg-sky-50 text-sky-700 border-sky-200",
  Contacted: "bg-amber-50 text-amber-700 border-amber-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  InProgress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Settled: "bg-green-50 text-green-700 border-green-200",
  Closed: "bg-slate-50 text-slate-600 border-slate-200",
};

const INTERACTION_TYPES: NewcomerInteraction["interaction_type"][] = [
  "Call",
  "Visit",
  "Meeting",
  "Note",
  "Other",
];

const TAB_OPTIONS = [
  "Overview",
  "Contacts",
  "Addresses",
  "Background",
  "Interactions",
  "Sponsorship",
  "Promote",
] as const;

type TabOption = typeof TAB_OPTIONS[number];

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString();
}

function statusNext(current: Newcomer["status"]) {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

export default function NewcomerProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const toast = useToast();
  const canView = permissions.viewNewcomers || permissions.manageNewcomers;
  const canManage = permissions.manageNewcomers;
  const isAdmin = permissions.hasRole("Admin") || permissions.isSuperAdmin;
  const numericId = Number(id);

  const [loading, setLoading] = useState(true);
  const [newcomer, setNewcomer] = useState<Newcomer | null>(null);
  const [timeline, setTimeline] = useState<NewcomerTimelineResponse | null>(null);
  const [interactions, setInteractions] = useState<NewcomerInteractionListResponse | null>(null);
  const [addressHistory, setAddressHistory] = useState<NewcomerAddressHistoryListResponse | null>(null);
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [activeTab, setActiveTab] = useState<TabOption>("Overview");

  const [assignStaffId, setAssignStaffId] = useState("");
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [interactionType, setInteractionType] = useState<NewcomerInteraction["interaction_type"]>("Note");
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionSubmitting, setInteractionSubmitting] = useState(false);

  const [statusModal, setStatusModal] = useState<StatusModalState>({ open: false, mode: null });
  const [statusChoice, setStatusChoice] = useState<Newcomer["status"] | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [settledReason, setSettledReason] = useState("");
  const [settledNotes, setSettledNotes] = useState("");

  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [convertForm, setConvertForm] = useState({
    phone: "",
    email: "",
    status: "",
    district: "",
    notes: "",
    household_name: "",
  });

  useEffect(() => {
    if (!newcomer) return;
    setConvertForm({
      phone: newcomer.contact_phone || newcomer.contact_whatsapp || "",
      email: newcomer.contact_email || "",
      status: "",
      district: "",
      notes: "",
      household_name: "",
    });
  }, [newcomer?.id]);

  const openStatusModal = (mode: StatusModalState["mode"]) => {
    setStatusModal({ open: true, mode });
    setStatusChoice("");
    setStatusReason("");
    setSettledReason("");
    setSettledNotes("");
  };

  const primaryAction = useMemo(() => {
    if (!newcomer) return null;
    if (newcomer.is_inactive) {
      return isAdmin ? { label: "Reactivate", action: () => openStatusModal("reactivate") } : null;
    }
    if (newcomer.status === "New") {
      return { label: "Mark Contacted", action: () => handleStatusTransition("Contacted") };
    }
    if (newcomer.status === "Contacted") {
      return { label: "Assign", action: () => handleStatusTransition("Assigned") };
    }
    if (newcomer.status === "Assigned") {
      return { label: "Move to In Progress", action: () => handleStatusTransition("InProgress") };
    }
    if (newcomer.status === "InProgress") {
      return { label: "Mark Settled", action: () => openStatusModal("settle") };
    }
    if (newcomer.status === "Settled") {
      return { label: "Close Case", action: () => handleStatusTransition("Closed") };
    }
    if (newcomer.status === "Closed") {
      return isAdmin ? { label: "Reopen", action: () => openStatusModal("reopen") } : null;
    }
    return null;
  }, [newcomer, isAdmin]);

  useEffect(() => {
    if (!canView) return;
    if (!id || Number.isNaN(numericId)) {
      setLoading(false);
      return;
    }
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const detail = await getNewcomer(numericId);
        if (!active) return;
        setNewcomer(detail);
        setAssignStaffId(detail.assigned_owner_id ? String(detail.assigned_owner_id) : "");
        const [timelineData, interactionData, addressData, staffData] = await Promise.all([
          getNewcomerTimeline(numericId),
          listNewcomerInteractions(numericId),
          listNewcomerAddressHistory(numericId),
          listStaff().then((resp) => resp.items),
        ]);
        if (!active) return;
        setTimeline(timelineData);
        setInteractions(interactionData);
        setAddressHistory(addressData);
        setStaff(staffData);
      } catch (error) {
        console.error(error);
        if (error instanceof ApiError && error.status === 404) {
          toast.push("Newcomer not found.");
        } else {
          toast.push("Unable to load newcomer profile.");
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [canView, id, numericId, toast]);

  const refreshTimeline = async () => {
    if (!newcomer) return;
    const data = await getNewcomerTimeline(newcomer.id);
    setTimeline(data);
  };

  const refreshInteractions = async () => {
    if (!newcomer) return;
    const data = await listNewcomerInteractions(newcomer.id);
    setInteractions(data);
  };

  const handleStatusTransition = async (status: Newcomer["status"], reason?: string) => {
    if (!newcomer) return;
    setStatusSubmitting(true);
    try {
      const updated = await transitionNewcomerStatus(newcomer.id, {
        status,
        reason: reason || undefined,
      });
      setNewcomer(updated);
      await refreshTimeline();
      toast.push("Status updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update status.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleAssign = async () => {
    if (!newcomer) return;
    setAssignSubmitting(true);
    try {
      const updated = await updateNewcomer(newcomer.id, {
        assigned_owner_id: assignStaffId ? Number(assignStaffId) : null,
      });
      setNewcomer(updated);
      await refreshTimeline();
      toast.push("Assignment updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update assignment.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleInteraction = async () => {
    if (!newcomer || !interactionNote.trim()) return;
    setInteractionSubmitting(true);
    try {
      await createNewcomerInteraction(newcomer.id, {
        interaction_type: interactionType,
        note: interactionNote.trim(),
      });
      setInteractionNote("");
      await refreshInteractions();
      await refreshTimeline();
      toast.push("Interaction logged.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to log interaction.");
    } finally {
      setInteractionSubmitting(false);
    }
  };

  const handleSettle = async () => {
    if (!newcomer) return;
    if (!settledReason.trim()) return;
    const reason = settledNotes.trim() ? `${settledReason}: ${settledNotes.trim()}` : settledReason;
    await handleStatusTransition("Settled", reason);
    setStatusModal({ open: false, mode: null });
    setSettledReason("");
    setSettledNotes("");
  };

  const handleReopen = async () => {
    if (!newcomer || !statusChoice || !statusReason.trim()) return;
    await handleStatusTransition(statusChoice, statusReason.trim());
    setStatusModal({ open: false, mode: null });
    setStatusChoice("");
    setStatusReason("");
  };

  const handleInactivate = async () => {
    if (!newcomer || !statusReason.trim()) return;
    setStatusSubmitting(true);
    try {
      const updated = await inactivateNewcomer(newcomer.id, {
        reason: statusReason.trim(),
        notes: settledNotes.trim(),
      });
      setNewcomer(updated);
      await refreshTimeline();
      toast.push("Newcomer marked inactive.");
      setStatusModal({ open: false, mode: null });
      setStatusReason("");
      setSettledNotes("");
    } catch (error) {
      console.error(error);
      toast.push("Unable to inactivate newcomer.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleReactivate = async () => {
    if (!newcomer) return;
    setStatusSubmitting(true);
    try {
      const updated = await reactivateNewcomer(newcomer.id, {
        reason: statusReason.trim() || undefined,
      });
      setNewcomer(updated);
      await refreshTimeline();
      toast.push("Newcomer reactivated.");
      setStatusModal({ open: false, mode: null });
      setStatusReason("");
    } catch (error) {
      console.error(error);
      toast.push("Unable to reactivate newcomer.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleConvert = async () => {
    if (!newcomer) return;
    const resolvedPhone =
      convertForm.phone.trim() ||
      newcomer.contact_phone?.trim() ||
      newcomer.contact_whatsapp?.trim() ||
      "";
    const resolvedEmail = convertForm.email.trim() || newcomer.contact_email?.trim() || "";
    if (!resolvedPhone) {
      toast.push("Phone is required to promote this newcomer.");
      return;
    }
    setConvertSubmitting(true);
    try {
      const updated = await convertNewcomer(newcomer.id, {
        phone: resolvedPhone || undefined,
        email: resolvedEmail || undefined,
        status: convertForm.status || undefined,
        district: convertForm.district || undefined,
        notes: convertForm.notes || undefined,
        household_name: convertForm.household_name || undefined,
      });
      setNewcomer(updated);
      await refreshTimeline();
      setConvertForm({
        phone: "",
        email: "",
        status: "",
        district: "",
        notes: "",
        household_name: "",
      });
      const memberId = updated.converted_member_id;
      if (memberId) {
        toast.push("Member created. Redirecting to the profile...");
        navigate(`/members/${memberId}/edit`);
        return;
      }
      toast.push("Member created.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to convert newcomer.");
    } finally {
      setConvertSubmitting(false);
    }
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  if (!id || Number.isNaN(numericId)) {
    return <Navigate to="/newcomers" replace />;
  }

  if (!loading && !newcomer) {
    return <Navigate to="/newcomers" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/newcomers")}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {newcomer ? newcomer.newcomer_code : "Newcomer profile"}
              </h1>
              {newcomer && (
                <Badge variant="outline" className={STATUS_BADGE_STYLES[newcomer.status]}>
                  {newcomer.status}
                </Badge>
              )}
              {newcomer?.is_inactive && (
                <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                  Inactive
                </Badge>
              )}
            </div>
            <p className="text-sm text-mute">Newcomer profile and linked settlement timeline.</p>
          </div>
        </div>
        {primaryAction && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={primaryAction.action} disabled={statusSubmitting}>
              {primaryAction.label}
            </Button>
            {isAdmin && newcomer && !newcomer.is_inactive && (
              <Button variant="ghost" onClick={() => openStatusModal("inactivate")}>
                Mark inactive
              </Button>
            )}
            {newcomer?.status === "Settled" && (
              <Button
                variant="ghost"
                onClick={() => setActiveTab("Promote")}
              >
                Promote to Member
              </Button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <Card className="p-10 flex flex-col items-center gap-3 text-mute">
          <Loader2 className="h-6 w-6 animate-spin" />
          Loading newcomer profile...
        </Card>
      )}

      {!loading && newcomer && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4 space-y-3">
              <h2 className="text-sm uppercase text-mute">Snapshot</h2>
              <div>
                <p className="text-lg font-semibold">
                  {newcomer.first_name} {newcomer.last_name}
                </p>
                <p className="text-sm text-mute">Household: {newcomer.household_type}</p>
                <p className="text-sm text-mute">Family size: {newcomer.family_size ?? "-"}</p>
              </div>
              <div className="text-sm text-mute space-y-1">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> {newcomer.contact_phone || newcomer.contact_whatsapp || "-"}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Province: {newcomer.county || "No province"}
                </div>
                <div>Interpreter: {newcomer.interpreter_required ? "Required" : "No"}</div>
                <div>Assigned to: {newcomer.assigned_owner_name || "-"}</div>
                <div>Sponsored by: {newcomer.sponsored_by_member_name || "-"}</div>
              </div>
              {newcomer.latest_sponsorship_id && (
                <Button
                  variant="ghost"
                  onClick={() => navigate(`/sponsorships/${newcomer.latest_sponsorship_id}`)}
                >
                  Open Sponsorship Case
                </Button>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm uppercase text-mute">Assignment</h2>
              <Select value={assignStaffId} onChange={(event) => setAssignStaffId(event.target.value)} disabled={!canManage}>
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name || member.username}
                  </option>
                ))}
              </Select>
              {canManage && (
                <Button onClick={handleAssign} disabled={assignSubmitting}>
                  {assignSubmitting ? "Saving..." : "Save assignment"}
                </Button>
              )}
            </Card>

            <Card className="p-4 space-y-3">
              <h2 className="text-sm uppercase text-mute">Status helper</h2>
              <div className="text-sm text-mute">
                Next step: {statusNext(newcomer.status) || "No further steps"}
              </div>
              {newcomer.status === "Closed" && (
                <div className="text-sm text-mute flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4" /> Admin can reopen with reason
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-6">
            <Card className="p-4 h-full">
              <h2 className="text-sm uppercase text-mute mb-4">Timeline</h2>
              {timeline?.items.length ? (
                <div className="relative pl-6">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" aria-hidden />
                  {timeline.items.map((event) => (
                    <div key={`${event.event_type}-${event.id}`} className="relative mb-6 pl-3">
                      <span className="absolute left-0 top-5 h-3 w-3 -translate-x-1 rounded-full bg-accent shadow-ring" />
                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-mute">{formatDateTime(event.occurred_at)}</div>
                            <div className="text-base font-semibold text-ink">{event.label}</div>
                          </div>
                          {event.event_type === "Interaction" && <UserCheck className="h-4 w-4 text-emerald-500" />}
                        </div>
                        {event.detail && <p className="mt-2 text-sm text-mute">{event.detail}</p>}
                        <div className="mt-2 text-xs text-mute">
                          {event.actor_name ? `by ${event.actor_name}` : ""}
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mute">No timeline activity yet.</p>
              )}
            </Card>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4">
              <div className="flex flex-wrap gap-2">
                {TAB_OPTIONS.map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "solid" : "ghost"}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab}
                  </Button>
                ))}
              </div>
            </Card>

            {activeTab === "Overview" && (
              <Card className="p-4 space-y-2">
                <div className="text-sm text-mute">Last interaction: {formatDate(newcomer.last_interaction_at)}</div>
                <div className="text-sm text-mute">Preferred languages: {newcomer.preferred_language || "-"}</div>
                <div className="text-sm text-mute">Follow-up due: {formatDate(newcomer.followup_due_date)}</div>
                <div className="text-sm text-mute">Current status: {newcomer.status}</div>
                {newcomer.is_inactive && (
                  <>
                    <div className="text-sm text-mute">Inactive reason: {newcomer.inactive_reason || "-"}</div>
                    <div className="text-sm text-mute">Inactive notes: {newcomer.inactive_notes || "-"}</div>
                  </>
                )}
              </Card>
            )}

            {activeTab === "Contacts" && (
              <Card className="p-4 space-y-2">
                <div className="text-sm">Phone: {newcomer.contact_phone || "-"}</div>
                <div className="text-sm">WhatsApp: {newcomer.contact_whatsapp || "-"}</div>
                <div className="text-sm">Email: {newcomer.contact_email || "-"}</div>
              </Card>
            )}

            {activeTab === "Addresses" && (
              <Card className="p-4 space-y-3">
                <div>
                  <div className="text-xs uppercase text-mute">Temporary address</div>
                  <div className="text-sm text-ink">
                    {newcomer.temporary_address_street || "-"}
                  </div>
                  <div className="text-sm text-mute">
                    {[newcomer.temporary_address_city, newcomer.temporary_address_province, newcomer.temporary_address_postal_code]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-mute">Current address</div>
                  <div className="text-sm text-ink">
                    {newcomer.current_address_street || "-"}
                  </div>
                  <div className="text-sm text-mute">
                    {[newcomer.current_address_city, newcomer.current_address_province, newcomer.current_address_postal_code]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </div>
                </div>
                <div className="pt-2">
                  <div className="text-xs uppercase text-mute">Address history</div>
                  {addressHistory?.items.length ? (
                    <div className="space-y-2">
                      {addressHistory.items.map((item) => (
                        <Card key={item.id} className="p-3">
                          <div className="text-xs text-mute">{formatDateTime(item.changed_at)}</div>
                          <div className="text-sm">{item.address_type}</div>
                          <div className="text-xs text-mute">
                            {[item.street, item.city, item.province, item.postal_code].filter(Boolean).join(", ") || "-"}
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-mute">No address history.</div>
                  )}
                </div>
              </Card>
            )}

            {activeTab === "Background" && (
              <Card className="p-4 space-y-2">
                <div>
                  <div className="text-xs uppercase text-mute">Past profession</div>
                  <div className="text-sm text-ink whitespace-pre-wrap">{newcomer.past_profession || "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-mute">Notes</div>
                  <div className="text-sm text-ink whitespace-pre-wrap">{newcomer.notes || "-"}</div>
                </div>
              </Card>
            )}

            {activeTab === "Interactions" && (
              <Card className="p-4 space-y-3">
                {interactions?.items.length ? (
                  <div className="space-y-2">
                    {interactions.items.map((item) => (
                      <Card key={item.id} className="p-3">
                        <div className="text-xs text-mute">{formatDateTime(item.occurred_at)}</div>
                        <div className="text-sm font-medium">{item.interaction_type}</div>
                        <div className="text-xs text-mute">{item.visibility}</div>
                        <div className="text-sm text-ink mt-1 whitespace-pre-wrap">{item.note}</div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-mute">No interactions logged yet.</p>
                )}
                {canManage && (
                  <div className="space-y-2 pt-2">
                    <Select value={interactionType} onChange={(event) => setInteractionType(event.target.value as NewcomerInteraction["interaction_type"])}>
                      {INTERACTION_TYPES.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </Select>
                    <Textarea
                      placeholder="Add interaction notes"
                      value={interactionNote}
                      onChange={(event) => setInteractionNote(event.target.value)}
                    />
                    <Button onClick={handleInteraction} disabled={interactionSubmitting || !interactionNote.trim()}>
                      {interactionSubmitting ? "Saving..." : "Add interaction"}
                    </Button>
                  </div>
                )}
              </Card>
            )}

            {activeTab === "Sponsorship" && (
              <Card className="p-4 space-y-2">
                <div className="text-sm">Sponsor: {newcomer.sponsored_by_member_name || "-"}</div>
                <div className="text-sm">Case status: {newcomer.latest_sponsorship_status || "-"}</div>
                {newcomer.latest_sponsorship_id && (
                  <Button
                    variant="ghost"
                    onClick={() => navigate(`/sponsorships/${newcomer.latest_sponsorship_id}`)}
                  >
                    Open sponsorship case
                  </Button>
                )}
              </Card>
            )}

            {activeTab === "Promote" && (
              <Card className="p-4 space-y-3">
                {newcomer.converted_member_id ? (
                  <div className="text-sm text-mute">
                    Converted to member #{newcomer.converted_member_id}.
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/members/${newcomer.converted_member_id}/edit`)}
                    >
                      View member profile
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Input
                        placeholder="Phone"
                        value={convertForm.phone}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, phone: event.target.value }))}
                      />
                      <Input
                        placeholder="Email"
                        value={convertForm.email}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, email: event.target.value }))}
                      />
                      <Select
                        value={convertForm.status}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, status: event.target.value }))}
                      >
                        <option value="">Select status</option>
                        {MEMBER_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        placeholder="District"
                        value={convertForm.district}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, district: event.target.value }))}
                      />
                      <Input
                        placeholder="Household name"
                        value={convertForm.household_name}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, household_name: event.target.value }))}
                      />
                      <Textarea
                        placeholder="Notes"
                        value={convertForm.notes}
                        onChange={(event) => setConvertForm((prev) => ({ ...prev, notes: event.target.value }))}
                      />
                    </div>
                    <Button onClick={handleConvert} disabled={convertSubmitting}>
                      {convertSubmitting ? "Saving..." : "Promote to member"}
                    </Button>
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      )}

      {statusModal.open && statusModal.mode && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setStatusModal({ open: false, mode: null })}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-5 space-y-3">
              {statusModal.mode === "settle" && (
                <>
                  <h3 className="text-lg font-semibold">Mark settled</h3>
                  <Select value={settledReason} onChange={(event) => setSettledReason(event.target.value)}>
                    <option value="">Select reason</option>
                    <option value="Housing secured">Housing secured</option>
                    <option value="Job obtained">Job obtained</option>
                    <option value="Housing and job">Housing and job</option>
                  </Select>
                  <Textarea
                    placeholder="Notes (optional)"
                    value={settledNotes}
                    onChange={(event) => setSettledNotes(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setStatusModal({ open: false, mode: null })}>
                      Cancel
                    </Button>
                    <Button onClick={handleSettle} disabled={statusSubmitting || !settledReason}>
                      Confirm
                    </Button>
                  </div>
                </>
              )}

              {statusModal.mode === "reopen" && (
                <>
                  <h3 className="text-lg font-semibold">Reopen case</h3>
                  <Select value={statusChoice} onChange={(event) => setStatusChoice(event.target.value as Newcomer["status"])}>
                    <option value="">Select status</option>
                    {STATUS_FLOW.filter((status) => status !== "Closed").map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                  <Textarea
                    placeholder="Reason (required)"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setStatusModal({ open: false, mode: null })}>
                      Cancel
                    </Button>
                    <Button onClick={handleReopen} disabled={statusSubmitting || !statusChoice || !statusReason.trim()}>
                      Confirm
                    </Button>
                  </div>
                </>
              )}

              {statusModal.mode === "inactivate" && (
                <>
                  <h3 className="text-lg font-semibold">Mark inactive</h3>
                  <Textarea
                    placeholder="Reason (required)"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                  />
                  <Textarea
                    placeholder="Notes (required)"
                    value={settledNotes}
                    onChange={(event) => setSettledNotes(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setStatusModal({ open: false, mode: null })}>
                      Cancel
                    </Button>
                    <Button onClick={handleInactivate} disabled={statusSubmitting || !statusReason.trim() || !settledNotes.trim()}>
                      Confirm
                    </Button>
                  </div>
                </>
              )}

              {statusModal.mode === "reactivate" && (
                <>
                  <h3 className="text-lg font-semibold">Reactivate newcomer</h3>
                  <Textarea
                    placeholder="Reason (optional)"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setStatusModal({ open: false, mode: null })}>
                      Cancel
                    </Button>
                    <Button onClick={handleReactivate} disabled={statusSubmitting}>
                      Confirm
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
