import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, Phone, ShieldAlert, UserCheck } from "lucide-react";

import { PhoneInput } from "@/components/PhoneInput";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { parseApiFieldErrors } from "@/lib/formErrors";
import {
  ApiError,
  Member,
  Newcomer,
  NewcomerAddressHistoryListResponse,
  NewcomerInteraction,
  NewcomerInteractionListResponse,
  NewcomerTimelineResponse,
  convertNewcomer,
  createNewcomerInteraction,
  getNewcomer,
  getNewcomerTimeline,
  inactivateNewcomer,
  listNewcomerAddressHistory,
  listNewcomerInteractions,
  reactivateNewcomer,
  searchMembers,
  transitionNewcomerStatus,
  updateNewcomer,
} from "@/lib/api";
import {
  COUNTRY_OPTIONS,
  getNewcomerPastProfessionSelectValue,
  isNewcomerPastProfessionOption,
  MEMBER_STATUS_OPTIONS,
  NEWCOMER_PAST_PROFESSION_OPTIONS,
  NEWCOMER_PAST_PROFESSION_OTHER_VALUE,
  PROVINCE_OPTIONS,
} from "@/lib/options";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  getCanonicalCanadianPhone,
  getCanadianPhoneValidationMessage,
  hasValidEmail,
  normalizeEmailInput,
} from "@/lib/validation";

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

type NewcomerDetailsForm = {
  first_name: string;
  last_name: string;
  household_type: Newcomer["household_type"];
  family_size: string;
  preferred_language: string;
  interpreter_required: boolean;
  contact_phone: string;
  contact_whatsapp: string;
  contact_email: string;
  country: string;
  temporary_address_street: string;
  temporary_address_city: string;
  temporary_address_province: string;
  temporary_address_postal_code: string;
  past_profession: string;
  notes: string;
};

type NewcomerDetailFieldErrors = Partial<Record<keyof NewcomerDetailsForm, string>>;

const emptyDetailsForm = (): NewcomerDetailsForm => ({
  first_name: "",
  last_name: "",
  household_type: "Individual",
  family_size: "",
  preferred_language: "",
  interpreter_required: false,
  contact_phone: "",
  contact_whatsapp: "",
  contact_email: "",
  country: "",
  temporary_address_street: "",
  temporary_address_city: "",
  temporary_address_province: "",
  temporary_address_postal_code: "",
  past_profession: "",
  notes: "",
});

function detailsFormFromNewcomer(newcomer: Newcomer): NewcomerDetailsForm {
  return {
    first_name: newcomer.first_name ?? "",
    last_name: newcomer.last_name ?? "",
    household_type: newcomer.household_type ?? "Individual",
    family_size: newcomer.family_size != null ? String(newcomer.family_size) : "",
    preferred_language: newcomer.preferred_language ?? "",
    interpreter_required: Boolean(newcomer.interpreter_required),
    contact_phone: newcomer.contact_phone ?? "",
    contact_whatsapp: newcomer.contact_whatsapp ?? "",
    contact_email: newcomer.contact_email ?? "",
    country: newcomer.country ?? "",
    temporary_address_street: newcomer.temporary_address_street ?? "",
    temporary_address_city: newcomer.temporary_address_city ?? "",
    temporary_address_province: newcomer.temporary_address_province ?? "",
    temporary_address_postal_code: newcomer.temporary_address_postal_code ?? "",
    past_profession: newcomer.past_profession ?? "",
    notes: newcomer.notes ?? "",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function memberFullName(member?: Pick<Member, "first_name" | "last_name"> | null) {
  if (!member) return "";
  return [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
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
  const [activeTab, setActiveTab] = useState<TabOption>("Overview");

  const [assignSponsorId, setAssignSponsorId] = useState("");
  const [assignSponsorName, setAssignSponsorName] = useState("");
  const [sponsorSearchQuery, setSponsorSearchQuery] = useState("");
  const [sponsorSearchResults, setSponsorSearchResults] = useState<Member[]>([]);
  const [sponsorSearchLoading, setSponsorSearchLoading] = useState(false);
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
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailsSubmitting, setDetailsSubmitting] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsFieldErrors, setDetailsFieldErrors] = useState<NewcomerDetailFieldErrors>({});
  const [detailsForm, setDetailsForm] = useState<NewcomerDetailsForm>(emptyDetailsForm);
  const [detailsPastProfessionSelection, setDetailsPastProfessionSelection] = useState<string>("");
  const debouncedSponsorSearchQuery = useDebouncedValue(sponsorSearchQuery, 300);

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
      return { label: "Assign sponsor", action: () => handleStatusTransition("Assigned") };
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
        setAssignSponsorId(detail.sponsored_by_member_id ? String(detail.sponsored_by_member_id) : "");
        setAssignSponsorName(detail.sponsored_by_member_name || "");
        setSponsorSearchQuery("");
        setSponsorSearchResults([]);
        const [timelineData, interactionData, addressData] = await Promise.all([
          getNewcomerTimeline(numericId),
          listNewcomerInteractions(numericId),
          listNewcomerAddressHistory(numericId),
        ]);
        if (!active) return;
        setTimeline(timelineData);
        setInteractions(interactionData);
        setAddressHistory(addressData);
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

  useEffect(() => {
    if (!debouncedSponsorSearchQuery.trim()) {
      setSponsorSearchResults([]);
      setSponsorSearchLoading(false);
      return;
    }
    let active = true;
    setSponsorSearchLoading(true);
    searchMembers(debouncedSponsorSearchQuery.trim(), 6)
      .then((response) => {
        if (active) {
          setSponsorSearchResults(response.items.slice(0, 6));
        }
      })
      .catch((error) => {
        if (active) {
          console.error(error);
          setSponsorSearchResults([]);
        }
      })
      .finally(() => {
        if (active) {
          setSponsorSearchLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [debouncedSponsorSearchQuery]);

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

  const refreshAddressHistory = async () => {
    if (!newcomer) return;
    const data = await listNewcomerAddressHistory(newcomer.id);
    setAddressHistory(data);
  };

  const openDetailsModal = () => {
    if (!newcomer) return;
    setDetailsForm(detailsFormFromNewcomer(newcomer));
    setDetailsPastProfessionSelection(getNewcomerPastProfessionSelectValue(newcomer.past_profession));
    setDetailsFieldErrors({});
    setDetailsError(null);
    setDetailsModalOpen(true);
  };

  const clearDetailsFieldError = (field: keyof NewcomerDetailsForm) => {
    setDetailsFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (detailsError) {
      setDetailsError(null);
    }
  };

  const detailsFieldClass = (field: keyof NewcomerDetailsForm) =>
    detailsFieldErrors[field] ? "border-rose-300 focus:border-rose-500 focus:shadow-rose-200" : "";

  const validateDetailsForm = () => {
    const fieldErrors: NewcomerDetailFieldErrors = {};

    if (!detailsForm.first_name.trim()) {
      fieldErrors.first_name = "First name is required.";
    }
    if (!detailsForm.last_name.trim()) {
      fieldErrors.last_name = "Last name is required.";
    }

    if (detailsForm.family_size.trim()) {
      const size = Number(detailsForm.family_size.trim());
      if (!Number.isInteger(size) || size < 1 || size > 20) {
        fieldErrors.family_size = "Family size must be between 1 and 20.";
      }
    }

    const phoneInput = detailsForm.contact_phone.trim();
    if (phoneInput && !getCanonicalCanadianPhone(phoneInput)) {
      fieldErrors.contact_phone =
        getCanadianPhoneValidationMessage(phoneInput, "Phone") ||
        "Enter a valid Canadian phone number in +1########## format.";
    }

    const whatsAppInput = detailsForm.contact_whatsapp.trim();
    if (whatsAppInput && !getCanonicalCanadianPhone(whatsAppInput)) {
      fieldErrors.contact_whatsapp =
        getCanadianPhoneValidationMessage(whatsAppInput, "WhatsApp number") ||
        "Enter a valid Canadian WhatsApp number in +1########## format.";
    }

    const emailInput = detailsForm.contact_email.trim();
    if (emailInput && !hasValidEmail(normalizeEmailInput(emailInput))) {
      fieldErrors.contact_email = "Enter a valid email address in the format name@example.com.";
    }

    return {
      fieldErrors,
      isValid: Object.keys(fieldErrors).length === 0,
    };
  };

  const handleSaveDetails = async () => {
    if (!newcomer) return;

    const validation = validateDetailsForm();
    if (!validation.isValid) {
      setDetailsFieldErrors(validation.fieldErrors);
      setDetailsError("Fix the highlighted fields.");
      return;
    }

    const normalizedPhone = detailsForm.contact_phone.trim()
      ? getCanonicalCanadianPhone(detailsForm.contact_phone.trim())
      : null;
    const normalizedWhatsApp = detailsForm.contact_whatsapp.trim()
      ? getCanonicalCanadianPhone(detailsForm.contact_whatsapp.trim())
      : null;
    const normalizedEmail = detailsForm.contact_email.trim()
      ? normalizeEmailInput(detailsForm.contact_email.trim())
      : "";

    setDetailsSubmitting(true);
    setDetailsFieldErrors({});
    setDetailsError(null);
    try {
      const updated = await updateNewcomer(newcomer.id, {
        first_name: detailsForm.first_name.trim(),
        last_name: detailsForm.last_name.trim(),
        household_type: detailsForm.household_type,
        family_size: detailsForm.family_size.trim() ? Number(detailsForm.family_size.trim()) : undefined,
        preferred_language: detailsForm.preferred_language.trim() || undefined,
        interpreter_required: detailsForm.interpreter_required,
        contact_phone: normalizedPhone || undefined,
        contact_whatsapp: normalizedWhatsApp || undefined,
        contact_email: normalizedEmail || undefined,
        country: detailsForm.country.trim() || undefined,
        temporary_address_street: detailsForm.temporary_address_street.trim() || undefined,
        temporary_address_city: detailsForm.temporary_address_city.trim() || undefined,
        temporary_address_province: detailsForm.temporary_address_province.trim() || undefined,
        temporary_address_postal_code: detailsForm.temporary_address_postal_code.trim() || undefined,
        county: detailsForm.temporary_address_province.trim() || undefined,
        past_profession: detailsForm.past_profession.trim() || undefined,
        notes: detailsForm.notes.trim() || undefined,
      });
      setNewcomer(updated);
      await Promise.all([refreshTimeline(), refreshAddressHistory()]);
      setDetailsModalOpen(false);
      toast.push("Newcomer details updated.");
    } catch (error) {
      console.error(error);
      const parsed = parseApiFieldErrors(error);
      if (parsed) {
        setDetailsFieldErrors(parsed.fieldErrors as NewcomerDetailFieldErrors);
        setDetailsError(parsed.formError || "Fix the highlighted fields.");
      } else if (error instanceof ApiError) {
        setDetailsError(error.body || "Unable to update newcomer details.");
      } else {
        setDetailsError("Unable to update newcomer details.");
      }
    } finally {
      setDetailsSubmitting(false);
    }
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
        sponsored_by_member_id: assignSponsorId ? Number(assignSponsorId) : null,
      });
      setNewcomer(updated);
      await refreshTimeline();
      toast.push("Sponsor assignment updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update sponsor assignment.");
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
        {(primaryAction || (canManage && newcomer)) && (
          <div className="flex flex-wrap gap-2">
            {primaryAction && (
              <Button onClick={primaryAction.action} disabled={statusSubmitting}>
                {primaryAction.label}
              </Button>
            )}
            {canManage && newcomer && (
              <Button variant="ghost" onClick={openDetailsModal}>
                Edit details
              </Button>
            )}
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
                <div>Country of origin: {newcomer.country || "-"}</div>
                <div>Interpreter: {newcomer.interpreter_required ? "Required" : "No"}</div>
                <div>Assigned sponsor: {newcomer.sponsored_by_member_name || "-"}</div>
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
              <h2 className="text-sm uppercase text-mute">Sponsor Assignment</h2>
              <div className="space-y-3">
                <div className="text-sm text-mute">
                  Current sponsor: <span className="font-medium text-ink">{assignSponsorName || "Unassigned"}</span>
                </div>
                <Input
                  value={sponsorSearchQuery}
                  onChange={(event) => setSponsorSearchQuery(event.target.value)}
                  placeholder="Search member by name"
                  disabled={!canManage}
                />
                {sponsorSearchLoading && <p className="text-xs text-mute">Searching members...</p>}
                {!sponsorSearchLoading && sponsorSearchQuery.trim() && sponsorSearchResults.length === 0 && (
                  <p className="text-xs text-mute">No matching members found.</p>
                )}
                {sponsorSearchResults.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                    {sponsorSearchResults.map((member) => {
                      const name = memberFullName(member) || member.username;
                      const selected = String(member.id) === assignSponsorId;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${selected ? "bg-accent/10 text-accent" : "hover:bg-muted/50"}`}
                          onClick={() => {
                            setAssignSponsorId(String(member.id));
                            setAssignSponsorName(name);
                            setSponsorSearchQuery("");
                            setSponsorSearchResults([]);
                          }}
                        >
                          <span>{name}</span>
                          {selected && <span className="text-xs font-medium">Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {assignSponsorId && canManage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAssignSponsorId("");
                      setAssignSponsorName("");
                      setSponsorSearchQuery("");
                      setSponsorSearchResults([]);
                    }}
                  >
                    Clear sponsor
                  </Button>
                )}
              </div>
              {canManage && (
                <Button onClick={handleAssign} disabled={assignSubmitting}>
                  {assignSubmitting ? "Saving..." : "Save sponsor"}
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
                  <div className="text-xs uppercase text-mute">Country of origin</div>
                  <div className="text-sm text-ink">{newcomer.country || "-"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-mute">Past profession / service</div>
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
                <div className="text-sm">Assigned sponsor: {newcomer.sponsored_by_member_name || "-"}</div>
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

      {detailsModalOpen && newcomer && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setDetailsModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-4xl max-h-[92vh] flex flex-col">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Edit newcomer details</h3>
                  <p className="text-sm text-mute">Update intake/contact/background details.</p>
                </div>
                <Button variant="ghost" onClick={() => setDetailsModalOpen(false)}>
                  Close
                </Button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {detailsError && (
                  <Card className="p-3 border-red-200 bg-red-50 text-red-700 text-sm">{detailsError}</Card>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">First name</label>
                    <Input
                      value={detailsForm.first_name}
                      className={detailsFieldClass("first_name")}
                      onChange={(event) => {
                        setDetailsForm((prev) => ({ ...prev, first_name: event.target.value }));
                        clearDetailsFieldError("first_name");
                      }}
                    />
                    {detailsFieldErrors.first_name && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.first_name}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                    <Input
                      value={detailsForm.last_name}
                      className={detailsFieldClass("last_name")}
                      onChange={(event) => {
                        setDetailsForm((prev) => ({ ...prev, last_name: event.target.value }));
                        clearDetailsFieldError("last_name");
                      }}
                    />
                    {detailsFieldErrors.last_name && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.last_name}</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Household type</label>
                    <Select
                      value={detailsForm.household_type}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({
                          ...prev,
                          household_type: event.target.value as Newcomer["household_type"],
                        }))
                      }
                    >
                      <option value="Individual">Individual</option>
                      <option value="Family">Family</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Family size</label>
                    <Input
                      type="number"
                      min={1}
                      value={detailsForm.family_size}
                      className={detailsFieldClass("family_size")}
                      onChange={(event) => {
                        setDetailsForm((prev) => ({ ...prev, family_size: event.target.value }));
                        clearDetailsFieldError("family_size");
                      }}
                    />
                    {detailsFieldErrors.family_size && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.family_size}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Interpreter</label>
                    <div className="h-10 px-3 rounded-xl border border-border bg-card/80 flex items-center">
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={detailsForm.interpreter_required}
                          onChange={(event) =>
                            setDetailsForm((prev) => ({ ...prev, interpreter_required: event.target.checked }))
                          }
                        />
                        Required
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Preferred language(s)</label>
                  <Input
                    value={detailsForm.preferred_language}
                    placeholder="e.g. Amharic, English"
                    onChange={(event) => setDetailsForm((prev) => ({ ...prev, preferred_language: event.target.value }))}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                    <PhoneInput
                      value={detailsForm.contact_phone}
                      className={detailsFieldClass("contact_phone")}
                      onChange={(value) => {
                        setDetailsForm((prev) => ({ ...prev, contact_phone: value }));
                        clearDetailsFieldError("contact_phone");
                      }}
                    />
                    {detailsFieldErrors.contact_phone && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.contact_phone}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">WhatsApp</label>
                    <PhoneInput
                      value={detailsForm.contact_whatsapp}
                      className={detailsFieldClass("contact_whatsapp")}
                      onChange={(value) => {
                        setDetailsForm((prev) => ({ ...prev, contact_whatsapp: value }));
                        clearDetailsFieldError("contact_whatsapp");
                      }}
                    />
                    {detailsFieldErrors.contact_whatsapp && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.contact_whatsapp}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Email</label>
                  <Input
                    type="email"
                    value={detailsForm.contact_email}
                    className={detailsFieldClass("contact_email")}
                    onChange={(event) => {
                      setDetailsForm((prev) => ({ ...prev, contact_email: event.target.value }));
                      clearDetailsFieldError("contact_email");
                    }}
                    onBlur={() =>
                      setDetailsForm((prev) => ({
                        ...prev,
                        contact_email: prev.contact_email ? normalizeEmailInput(prev.contact_email) : "",
                      }))
                    }
                  />
                  {detailsFieldErrors.contact_email && (
                    <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.contact_email}</p>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Country of origin</label>
                    <Select
                      value={detailsForm.country}
                      onChange={(event) => setDetailsForm((prev) => ({ ...prev, country: event.target.value }))}
                    >
                      <option value="">Select country of origin</option>
                      {COUNTRY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Province</label>
                    <Select
                      value={detailsForm.temporary_address_province}
                      onChange={(event) => setDetailsForm((prev) => ({ ...prev, temporary_address_province: event.target.value }))}
                    >
                      <option value="">Select province</option>
                      {PROVINCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase text-mute block mb-1">Street</label>
                    <Input
                      value={detailsForm.temporary_address_street}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({ ...prev, temporary_address_street: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">City</label>
                    <Input
                      value={detailsForm.temporary_address_city}
                      onChange={(event) =>
                        setDetailsForm((prev) => ({ ...prev, temporary_address_city: event.target.value }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Postal code</label>
                  <Input
                    value={detailsForm.temporary_address_postal_code}
                    onChange={(event) =>
                      setDetailsForm((prev) => ({ ...prev, temporary_address_postal_code: event.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Past profession / service</label>
                  <Select
                    value={detailsPastProfessionSelection}
                    onChange={(event) => {
                      const nextSelection = event.target.value;
                      setDetailsPastProfessionSelection(nextSelection);
                      setDetailsForm((prev) => ({
                        ...prev,
                        past_profession:
                          nextSelection === NEWCOMER_PAST_PROFESSION_OTHER_VALUE
                            ? (isNewcomerPastProfessionOption(prev.past_profession) ? "" : prev.past_profession)
                            : nextSelection,
                      }));
                      clearDetailsFieldError("past_profession");
                    }}
                  >
                    <option value="">Select profession / service</option>
                    {NEWCOMER_PAST_PROFESSION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                    <option value={NEWCOMER_PAST_PROFESSION_OTHER_VALUE}>Others</option>
                  </Select>
                  {detailsFieldErrors.past_profession && detailsPastProfessionSelection !== NEWCOMER_PAST_PROFESSION_OTHER_VALUE && (
                    <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.past_profession}</p>
                  )}
                </div>

                {detailsPastProfessionSelection === NEWCOMER_PAST_PROFESSION_OTHER_VALUE && (
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Specify other profession / service</label>
                    <Input
                      value={detailsForm.past_profession}
                      className={detailsFieldClass("past_profession")}
                      placeholder="Enter profession / service"
                      onChange={(event) => {
                        setDetailsForm((prev) => ({ ...prev, past_profession: event.target.value }));
                        clearDetailsFieldError("past_profession");
                      }}
                    />
                    {detailsFieldErrors.past_profession && (
                      <p className="mt-1 text-xs text-rose-600">{detailsFieldErrors.past_profession}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                  <Textarea
                    value={detailsForm.notes}
                    onChange={(event) => setDetailsForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>

              <div className="p-5 border-t border-border flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setDetailsModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveDetails} disabled={detailsSubmitting}>
                  {detailsSubmitting ? "Saving..." : "Save details"}
                </Button>
              </div>
            </Card>
          </div>
        </>
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
