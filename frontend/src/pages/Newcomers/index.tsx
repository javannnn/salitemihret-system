import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PlusCircle, RefreshCcw, Search } from "lucide-react";

import { PhoneInput } from "@/components/PhoneInput";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { getCache, setCache } from "@/lib/cache";
import {
  ApiError,
  Member,
  Newcomer,
  NewcomerInteraction,
  NewcomerMetrics,
  NewcomerListResponse,
  createNewcomer,
  createNewcomerInteraction,
  getNewcomerMetrics,
  listNewcomers,
  searchMembers,
  transitionNewcomerStatus,
  updateNewcomer,
} from "@/lib/api";
import { parseApiFieldErrors } from "@/lib/formErrors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  CITY_OPTIONS_BY_PROVINCE,
  COUNTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  PROVINCE_OPTIONS,
} from "@/lib/options";
import {
  formatCanadianPostalCode,
  getCanonicalCanadianPhone,
  getCanadianPostalCodeValidationMessage,
  getCanadianPhoneSnapSuggestion,
  getCanadianPhoneValidationMessage,
  hasValidEmail,
  normalizeEmailInput,
} from "@/lib/validation";

type WizardStep = 0 | 1 | 2 | 3;

type NewcomerWizardForm = {
  household_type: Newcomer["household_type"];
  first_name: string;
  last_name: string;
  family_size: string;
  preferred_language: string[];
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
type NewcomerFieldErrors = Partial<Record<keyof NewcomerWizardForm, string>>;

type StatusModalState = {
  open: boolean;
  newcomer: Newcomer | null;
};

type AssignModalState = {
  open: boolean;
  newcomer: Newcomer | null;
};

type InteractionModalState = {
  open: boolean;
  newcomer: Newcomer | null;
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

const PAGE_SIZE = 12;

const emptyWizardForm = (): NewcomerWizardForm => ({
  household_type: "Individual",
  first_name: "",
  last_name: "",
  family_size: "",
  preferred_language: [],
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

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString();
}

function memberFullName(member?: Pick<Member, "first_name" | "last_name"> | null) {
  if (!member) return "";
  return [member.first_name, member.last_name].filter(Boolean).join(" ").trim();
}

function allowedStatuses(current: Newcomer["status"]) {
  if (current === "Closed") {
    return STATUS_FLOW.filter((status) => status !== "Closed");
  }
  const idx = STATUS_FLOW.indexOf(current);
  if (idx === -1) return STATUS_FLOW;
  return STATUS_FLOW.slice(idx + 1);
}

export default function NewcomersWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const canView = permissions.viewNewcomers || permissions.manageNewcomers;
  const canManage = permissions.manageNewcomers;

  const [metrics, setMetrics] = useState<NewcomerMetrics | null>(null);
  const [newcomers, setNewcomers] = useState<NewcomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    status: "",
    county: "",
    interpreter_required: "",
    inactive: "",
    q: "",
    page: 1,
  });

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [wizardForm, setWizardForm] = useState<NewcomerWizardForm>(emptyWizardForm);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardFieldErrors, setWizardFieldErrors] = useState<NewcomerFieldErrors>({});

  const [statusModal, setStatusModal] = useState<StatusModalState>({ open: false, newcomer: null });
  const [statusChoice, setStatusChoice] = useState<Newcomer["status"] | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [assignModal, setAssignModal] = useState<AssignModalState>({ open: false, newcomer: null });
  const [assignSponsorId, setAssignSponsorId] = useState("");
  const [assignSponsorName, setAssignSponsorName] = useState("");
  const [assignSponsorQuery, setAssignSponsorQuery] = useState("");
  const [assignSponsorResults, setAssignSponsorResults] = useState<Member[]>([]);
  const [assignSponsorLoading, setAssignSponsorLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);

  const [interactionModal, setInteractionModal] = useState<InteractionModalState>({ open: false, newcomer: null });
  const [interactionType, setInteractionType] = useState<NewcomerInteraction["interaction_type"]>("Note");
  const [interactionNote, setInteractionNote] = useState("");
  const [interactionSubmitting, setInteractionSubmitting] = useState(false);
  const listRequestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(filters.q, 350);
  const debouncedAssignSponsorQuery = useDebouncedValue(assignSponsorQuery, 300);

  const totalPages = useMemo(() => {
    if (!newcomers) return 1;
    return Math.max(1, Math.ceil(newcomers.total / PAGE_SIZE));
  }, [newcomers]);
  const cityOptions = useMemo(
    () => CITY_OPTIONS_BY_PROVINCE[wizardForm.temporary_address_province] ?? [],
    [wizardForm.temporary_address_province]
  );
  const phoneSnapSuggestion = useMemo(() => {
    const value = wizardForm.contact_phone.trim();
    if (!value || getCanonicalCanadianPhone(value)) {
      return null;
    }
    return getCanadianPhoneSnapSuggestion(value);
  }, [wizardForm.contact_phone]);
  const whatsAppSnapSuggestion = useMemo(() => {
    const value = wizardForm.contact_whatsapp.trim();
    if (!value || getCanonicalCanadianPhone(value)) {
      return null;
    }
    return getCanadianPhoneSnapSuggestion(value);
  }, [wizardForm.contact_whatsapp]);

  const activeFilters = useMemo(() => {
    const chips: string[] = [];
    if (filters.status) chips.push(`Status: ${filters.status}`);
    if (filters.county) {
      chips.push(`Province: ${filters.county}`);
    }
    if (filters.interpreter_required) {
      chips.push(`Interpreter: ${filters.interpreter_required === "true" ? "Yes" : "No"}`);
    }
    if (filters.inactive) {
      chips.push(`Inactive: ${filters.inactive === "true" ? "Yes" : "No"}`);
    }
    if (filters.q) chips.push(`Search: ${filters.q}`);
    return chips;
  }, [filters]);

  const listPayload = useMemo(
    () => ({
      status: filters.status || undefined,
      county: filters.county || undefined,
      interpreter_required: filters.interpreter_required ? filters.interpreter_required === "true" : undefined,
      inactive: filters.inactive ? filters.inactive === "true" : undefined,
      q: debouncedQuery || undefined,
      page: filters.page,
      page_size: PAGE_SIZE,
    }),
    [
      filters.status,
      filters.county,
      filters.interpreter_required,
      filters.inactive,
      filters.page,
      debouncedQuery,
    ]
  );

  const listCacheKey = useMemo(
    () => `newcomers:list:${JSON.stringify(listPayload)}`,
    [listPayload]
  );

  useEffect(() => {
    if (!canView) return;
    const cached = getCache<NewcomerListResponse>(listCacheKey);
    if (cached) {
      setNewcomers(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const requestId = ++listRequestRef.current;
    listNewcomers(listPayload)
      .then((response) => {
        if (requestId !== listRequestRef.current) return;
        setNewcomers(response);
        setCache(listCacheKey, response);
      })
      .catch((error) => {
        if (requestId !== listRequestRef.current) return;
        console.error(error);
        toast.push("Unable to load newcomers.");
      })
      .finally(() => {
        if (requestId === listRequestRef.current) {
          setLoading(false);
        }
      });
  }, [listPayload, listCacheKey, canView, toast]);

  useEffect(() => {
    if (!canView) return;
    const cachedMetrics = getCache<NewcomerMetrics>("newcomers:metrics", 60_000);
    if (cachedMetrics) {
      setMetrics(cachedMetrics);
    }
    getNewcomerMetrics()
      .then((next) => {
        setMetrics(next);
        setCache("newcomers:metrics", next);
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load newcomer metrics.");
      });
  }, [canView, toast]);

  useEffect(() => {
    if (!assignModal.open) {
      setAssignSponsorResults([]);
      setAssignSponsorLoading(false);
      return;
    }
    if (!debouncedAssignSponsorQuery.trim()) {
      setAssignSponsorResults([]);
      setAssignSponsorLoading(false);
      return;
    }
    let active = true;
    setAssignSponsorLoading(true);
    searchMembers(debouncedAssignSponsorQuery.trim(), 6)
      .then((response) => {
        if (active) {
          setAssignSponsorResults(response.items.slice(0, 6));
        }
      })
      .catch((error) => {
        if (active) {
          console.error(error);
          setAssignSponsorResults([]);
        }
      })
      .finally(() => {
        if (active) {
          setAssignSponsorLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [assignModal.open, debouncedAssignSponsorQuery]);

  const refreshMetrics = () => {
    if (!canView) return;
    getNewcomerMetrics()
      .then((next) => {
        setMetrics(next);
        setCache("newcomers:metrics", next);
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load newcomer metrics.");
      });
  };

  const clearWizardFieldError = (field: keyof NewcomerWizardForm) => {
    setWizardFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (wizardError) {
      setWizardError(null);
    }
  };

  const fieldErrorClass = (field: keyof NewcomerWizardForm) =>
    wizardFieldErrors[field] ? "border-rose-300 focus:border-rose-500 focus:shadow-rose-200" : "";

  const resetWizard = () => {
    setWizardStep(0);
    setWizardForm(emptyWizardForm());
    setWizardError(null);
    setWizardFieldErrors({});
  };

  const togglePreferredLanguage = (language: string) => {
    setWizardForm((prev) => ({
      ...prev,
      preferred_language: prev.preferred_language.includes(language)
        ? prev.preferred_language.filter((value) => value !== language)
        : [...prev.preferred_language, language],
    }));
  };

  const validateWizardSteps = (steps: WizardStep[]) => {
    const fieldErrors: NewcomerFieldErrors = {};
    let firstInvalidStep: WizardStep | null = null;

    const addFieldError = (step: WizardStep, field: keyof NewcomerWizardForm, message: string) => {
      if (!fieldErrors[field]) {
        fieldErrors[field] = message;
      }
      if (firstInvalidStep === null) {
        firstInvalidStep = step;
      }
    };

    if (steps.includes(0)) {
      if (!wizardForm.first_name.trim()) {
        addFieldError(0, "first_name", "First name is required.");
      }
      if (!wizardForm.last_name.trim()) {
        addFieldError(0, "last_name", "Last name is required.");
      }
      if (wizardForm.family_size) {
        const size = Number(wizardForm.family_size);
        if (!Number.isInteger(size) || size < 1 || size > 20) {
          addFieldError(0, "family_size", "Family size must be between 1 and 20.");
        }
      }
    }

    if (steps.includes(1)) {
      const phoneInput = wizardForm.contact_phone.trim();
      const emailInput = wizardForm.contact_email.trim();
      const normalizedEmail = emailInput ? normalizeEmailInput(emailInput) : "";
      const whatsappInput = wizardForm.contact_whatsapp.trim();
      const canonicalPhone = phoneInput ? getCanonicalCanadianPhone(phoneInput) : null;
      const canonicalWhatsApp = whatsappInput ? getCanonicalCanadianPhone(whatsappInput) : null;
      const phoneValidationMessage = phoneInput ? getCanadianPhoneValidationMessage(phoneInput, "Phone") : null;
      const whatsAppValidationMessage = whatsappInput
        ? getCanadianPhoneValidationMessage(whatsappInput, "WhatsApp number")
        : null;

      if (!phoneInput) {
        addFieldError(1, "contact_phone", "Phone is required.");
      } else if (!canonicalPhone) {
        addFieldError(
          1,
          "contact_phone",
          phoneValidationMessage || "Enter a valid Canadian phone number in +1########## format."
        );
      }

      if (!emailInput) {
        addFieldError(1, "contact_email", "Email is required.");
      } else if (!hasValidEmail(normalizedEmail)) {
        addFieldError(1, "contact_email", "Enter a valid email address in the format name@example.com.");
      }

      if (whatsappInput && !canonicalWhatsApp) {
        addFieldError(
          1,
          "contact_whatsapp",
          whatsAppValidationMessage || "Enter a valid Canadian WhatsApp number in +1########## format."
        );
      }
    }

    if (steps.includes(2)) {
      const postalCodeInput = wizardForm.temporary_address_postal_code.trim();
      const postalCodeValidationMessage = postalCodeInput
        ? getCanadianPostalCodeValidationMessage(postalCodeInput)
        : null;

      if (postalCodeValidationMessage) {
        addFieldError(2, "temporary_address_postal_code", postalCodeValidationMessage);
      }
    }

    const formError =
      firstInvalidStep === 1
        ? "Phone and email are required before you can continue."
        : firstInvalidStep !== null
          ? "Fix the highlighted fields."
          : null;

    return {
      fieldErrors,
      firstInvalidStep,
      formError,
      isValid: Object.keys(fieldErrors).length === 0,
    };
  };

  const handleWizardContinue = () => {
    const validation = validateWizardSteps([wizardStep]);
    if (!validation.isValid) {
      setWizardFieldErrors(validation.fieldErrors);
      setWizardError(validation.formError);
      return;
    }
    setWizardFieldErrors({});
    setWizardError(null);
    setWizardStep((prev) => ((prev + 1) as WizardStep));
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    resetWizard();
  };

  const handleCreateNewcomer = async () => {
    const validation = validateWizardSteps([0, 1, 2]);
    if (!validation.isValid) {
      setWizardFieldErrors(validation.fieldErrors);
      setWizardError(validation.formError);
      if (validation.firstInvalidStep !== null) {
        setWizardStep(validation.firstInvalidStep);
      }
      return;
    }

    const firstName = wizardForm.first_name.trim();
    const lastName = wizardForm.last_name.trim();
    const normalizedEmail = normalizeEmailInput(wizardForm.contact_email);
    const canonicalPhone = getCanonicalCanadianPhone(wizardForm.contact_phone)!;
    const canonicalWhatsApp = wizardForm.contact_whatsapp
      ? getCanonicalCanadianPhone(wizardForm.contact_whatsapp)
      : null;
    const formattedPostalCode = formatCanadianPostalCode(wizardForm.temporary_address_postal_code);

    setWizardSubmitting(true);
    setWizardError(null);
    setWizardFieldErrors({});
    try {
      await createNewcomer({
        first_name: firstName,
        last_name: lastName,
        household_type: wizardForm.household_type,
        family_size: wizardForm.family_size ? Number(wizardForm.family_size) : undefined,
        preferred_language: wizardForm.preferred_language.length ? wizardForm.preferred_language.join(", ") : undefined,
        interpreter_required: wizardForm.interpreter_required,
        contact_phone: canonicalPhone,
        contact_whatsapp: canonicalWhatsApp || undefined,
        contact_email: normalizedEmail,
        country: wizardForm.country || undefined,
        county: wizardForm.temporary_address_province || undefined,
        temporary_address_street: wizardForm.temporary_address_street || undefined,
        temporary_address_city: wizardForm.temporary_address_city || undefined,
        temporary_address_province: wizardForm.temporary_address_province || undefined,
        temporary_address_postal_code: formattedPostalCode || undefined,
        past_profession: wizardForm.past_profession || undefined,
        notes: wizardForm.notes || undefined,
        arrival_date: new Date().toISOString().slice(0, 10),
      });
      toast.push("Newcomer created.");
      handleWizardClose();
      refreshMetrics();
      setFilters((prev) => ({ ...prev, page: 1 }));
    } catch (error) {
      console.error(error);
      const parsed = parseApiFieldErrors(error);
      if (parsed) {
        setWizardFieldErrors(parsed.fieldErrors as NewcomerFieldErrors);
        setWizardError(parsed.formError || "Fix the highlighted fields.");
        return;
      }
      if (error instanceof ApiError) {
        setWizardError(error.body || "Unable to create newcomer.");
      } else {
        setWizardError("Unable to create newcomer.");
      }
    } finally {
      setWizardSubmitting(false);
    }
  };

  const openStatusModal = (newcomer: Newcomer) => {
    setStatusChoice("");
    setStatusReason("");
    setStatusModal({ open: true, newcomer });
  };

  const handleStatusChange = async () => {
    if (!statusModal.newcomer || !statusChoice) return;
    const reasonRequired = statusModal.newcomer.status === "Closed" || statusChoice === "Settled";
    if (reasonRequired && !statusReason.trim()) return;
    setStatusSubmitting(true);
    try {
      await transitionNewcomerStatus(statusModal.newcomer.id, {
        status: statusChoice,
        reason: statusReason.trim() || undefined,
      });
      toast.push("Status updated.");
      setStatusModal({ open: false, newcomer: null });
      refreshMetrics();
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Unable to update status.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const openAssignModal = (newcomer: Newcomer) => {
    setAssignSponsorId(newcomer.sponsored_by_member_id ? String(newcomer.sponsored_by_member_id) : "");
    setAssignSponsorName(newcomer.sponsored_by_member_name || "");
    setAssignSponsorQuery("");
    setAssignSponsorResults([]);
    setAssignModal({ open: true, newcomer });
  };

  const handleAssign = async () => {
    if (!assignModal.newcomer) return;
    setAssignSubmitting(true);
    try {
      await updateNewcomer(assignModal.newcomer.id, {
        sponsored_by_member_id: assignSponsorId ? Number(assignSponsorId) : null,
      });
      toast.push("Sponsor assignment updated.");
      setAssignModal({ open: false, newcomer: null });
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Unable to update sponsor assignment.");
    } finally {
      setAssignSubmitting(false);
    }
  };

  const openInteractionModal = (newcomer: Newcomer) => {
    setInteractionType("Note");
    setInteractionNote("");
    setInteractionModal({ open: true, newcomer });
  };

  const handleInteraction = async () => {
    if (!interactionModal.newcomer || !interactionNote.trim()) return;
    setInteractionSubmitting(true);
    try {
      await createNewcomerInteraction(interactionModal.newcomer.id, {
        interaction_type: interactionType,
        note: interactionNote.trim(),
      });
      toast.push("Interaction logged.");
      setInteractionModal({ open: false, newcomer: null });
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Unable to log interaction.");
    } finally {
      setInteractionSubmitting(false);
    }
  };

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Newcomer Settlement</h1>
          <p className="text-sm text-mute">Track newcomer settlement journeys and linked sponsorships.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              refreshMetrics();
              setFilters((prev) => ({ ...prev }));
            }}
          >
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          {canManage && (
            <Button onClick={() => setWizardOpen(true)}>
              <PlusCircle className="h-4 w-4" /> New Newcomer
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">New</p>
          <p className="text-2xl font-semibold">{metrics?.new_count ?? "-"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">In progress</p>
          <p className="text-2xl font-semibold">{metrics?.in_progress_count ?? "-"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Settled</p>
          <p className="text-2xl font-semibold">{metrics?.settled_count ?? "-"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Closed</p>
          <p className="text-2xl font-semibold">{metrics?.closed_count ?? "-"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Inactive</p>
          <p className="text-2xl font-semibold">{metrics?.inactive_count ?? "-"}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 w-full md:max-w-md">
            <Search className="h-4 w-4 text-mute" />
            <Input
              placeholder="Search newcomer, ID, or service"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
            />
          </div>
          <Select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
          >
            <option value="">All statuses</option>
            {STATUS_FLOW.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeFilters.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        )}

        <AnimatePresence>
          <motion.div
            className="grid gap-3 md:grid-cols-3 xl:grid-cols-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div>
              <label className="text-xs uppercase text-mute block mb-1">Province</label>
              <Select
                value={filters.county}
                onChange={(event) => setFilters((prev) => ({ ...prev, county: event.target.value, page: 1 }))}
              >
                <option value="">All provinces</option>
                {PROVINCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-mute block mb-1">Interpreter</label>
              <Select
                value={filters.interpreter_required}
                onChange={(event) => setFilters((prev) => ({ ...prev, interpreter_required: event.target.value, page: 1 }))}
              >
                <option value="">All</option>
                <option value="true">Required</option>
                <option value="false">Not required</option>
              </Select>
            </div>
            <div>
              <label className="text-xs uppercase text-mute block mb-1">Inactive</label>
              <Select
                value={filters.inactive}
                onChange={(event) => setFilters((prev) => ({ ...prev, inactive: event.target.value, page: 1 }))}
              >
                <option value="">All</option>
                <option value="true">Inactive</option>
                <option value="false">Active</option>
              </Select>
            </div>
          </motion.div>
        </AnimatePresence>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium">Newcomers</p>
          <Badge variant="outline">{newcomers?.total ?? 0} total</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-mute">
              <tr>
                <th className="px-4 py-2 text-left">Newcomer ID</th>
                <th className="px-4 py-2 text-left">Primary contact</th>
                <th className="px-4 py-2 text-left">Province</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Assigned sponsor</th>
                <th className="px-4 py-2 text-left">Sponsorship</th>
                <th className="px-4 py-2 text-left">Last interaction</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading newcomers...
                  </td>
                </tr>
              ) : newcomers?.items.length ? (
                newcomers.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{item.newcomer_code}</td>
                    <td className="px-4 py-2">
                      <p className="font-medium">
                        {item.first_name} {item.last_name}
                      </p>
                      <p className="text-xs text-mute">Family size: {item.family_size ?? "-"}</p>
                    </td>
                    <td className="px-4 py-2">{item.county || "-"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={STATUS_BADGE_STYLES[item.status]}>
                        {item.status}
                      </Badge>
                      {item.is_inactive && (
                        <Badge variant="outline" className="mt-1 bg-slate-50 text-slate-600 border-slate-200">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">{item.sponsored_by_member_name || "-"}</td>
                    <td className="px-4 py-2">{item.latest_sponsorship_status || "-"}</td>
                    <td className="px-4 py-2">{formatDate(item.last_interaction_at)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/newcomers/${item.id}`)}>
                          View
                        </Button>
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => openAssignModal(item)}>
                            Assign sponsor
                          </Button>
                        )}
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => openInteractionModal(item)}>
                            Add interaction
                          </Button>
                        )}
                        {canManage && (
                          <Button variant="ghost" size="sm" onClick={() => openStatusModal(item)}>
                            Change status
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                    No newcomers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
          >
            Prev
          </Button>
          <span className="text-xs text-mute">
            Page {filters.page} of {totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            Next
          </Button>
        </div>
      </Card>

      {wizardOpen && (
        <>
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40" onClick={handleWizardClose} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-card border-l border-border z-50 flex flex-col">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Newcomer intake</h2>
                <p className="text-sm text-mute">Step {wizardStep + 1} of 4</p>
              </div>
              <Button variant="ghost" onClick={handleWizardClose}>
                Close
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {wizardError && (
                <Card className="p-3 border-red-200 bg-red-50 text-red-700 text-sm">{wizardError}</Card>
              )}

              {wizardStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Household type</label>
                    <Select
                      value={wizardForm.household_type}
                      onChange={(event) => setWizardForm((prev) => ({ ...prev, household_type: event.target.value as Newcomer["household_type"] }))}
                    >
                      <option value="Individual">Individual</option>
                      <option value="Family">Family</option>
                    </Select>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">First name</label>
                      <Input
                        value={wizardForm.first_name}
                        className={fieldErrorClass("first_name")}
                        onChange={(event) => {
                          setWizardForm((prev) => ({ ...prev, first_name: event.target.value }));
                          clearWizardFieldError("first_name");
                        }}
                      />
                      {wizardFieldErrors.first_name && (
                        <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.first_name}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                      <Input
                        value={wizardForm.last_name}
                        className={fieldErrorClass("last_name")}
                        onChange={(event) => {
                          setWizardForm((prev) => ({ ...prev, last_name: event.target.value }));
                          clearWizardFieldError("last_name");
                        }}
                      />
                      {wizardFieldErrors.last_name && (
                        <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.last_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Family size</label>
                      <Input
                        type="number"
                        min={1}
                        value={wizardForm.family_size}
                        className={fieldErrorClass("family_size")}
                        onChange={(event) => {
                          setWizardForm((prev) => ({ ...prev, family_size: event.target.value }));
                          clearWizardFieldError("family_size");
                        }}
                      />
                      {wizardFieldErrors.family_size && (
                        <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.family_size}</p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-2">Preferred languages</label>
                      <div className="flex flex-wrap gap-2">
                        {LANGUAGE_OPTIONS.map((option) => {
                          const selected = wizardForm.preferred_language.includes(option.value);
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`rounded-xl border px-3 py-2 text-sm transition ${
                                selected
                                  ? "border-accent bg-accent/10 text-accent"
                                  : "border-border bg-card/70 text-ink hover:border-accent/40 hover:bg-accent/5"
                              }`}
                              onClick={() => togglePreferredLanguage(option.value)}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-mute">Select all languages that apply.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={wizardForm.interpreter_required}
                      onChange={(event) => setWizardForm((prev) => ({ ...prev, interpreter_required: event.target.checked }))}
                    />
                    <span className="text-sm">Interpreter required</span>
                  </div>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                    <PhoneInput
                      value={wizardForm.contact_phone}
                      className={fieldErrorClass("contact_phone")}
                      onChange={(value) => {
                        setWizardForm((prev) => ({ ...prev, contact_phone: value }));
                        clearWizardFieldError("contact_phone");
                      }}
                    />
                    {wizardFieldErrors.contact_phone ? (
                      <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.contact_phone}</p>
                    ) : (
                      <p className="mt-1 text-xs text-mute">Required. Use a Canadian number in +1 format.</p>
                    )}
                    {phoneSnapSuggestion && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                        onClick={() => {
                          setWizardForm((prev) => ({ ...prev, contact_phone: phoneSnapSuggestion }));
                          clearWizardFieldError("contact_phone");
                        }}
                      >
                        Snap to valid Canadian format: {phoneSnapSuggestion}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">WhatsApp</label>
                    <PhoneInput
                      value={wizardForm.contact_whatsapp}
                      className={fieldErrorClass("contact_whatsapp")}
                      onChange={(value) => {
                        setWizardForm((prev) => ({ ...prev, contact_whatsapp: value }));
                        clearWizardFieldError("contact_whatsapp");
                      }}
                    />
                    {wizardFieldErrors.contact_whatsapp && (
                      <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.contact_whatsapp}</p>
                    )}
                    {whatsAppSnapSuggestion && (
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                        onClick={() => {
                          setWizardForm((prev) => ({ ...prev, contact_whatsapp: whatsAppSnapSuggestion }));
                          clearWizardFieldError("contact_whatsapp");
                        }}
                      >
                        Snap WhatsApp to valid Canadian format: {whatsAppSnapSuggestion}
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Email</label>
                    <Input
                      type="email"
                      inputMode="email"
                      value={wizardForm.contact_email}
                      placeholder="name@example.com"
                      className={fieldErrorClass("contact_email")}
                      onChange={(event) => {
                        setWizardForm((prev) => ({ ...prev, contact_email: event.target.value }));
                        clearWizardFieldError("contact_email");
                      }}
                      onBlur={() =>
                        setWizardForm((prev) => ({
                          ...prev,
                          contact_email: prev.contact_email ? normalizeEmailInput(prev.contact_email) : "",
                        }))
                      }
                    />
                    {wizardFieldErrors.contact_email ? (
                      <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.contact_email}</p>
                    ) : (
                      <p className="mt-1 text-xs text-mute">Required. Use a full email like `name@example.com`.</p>
                    )}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Country of origin</label>
                      <Select
                        value={wizardForm.country}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, country: event.target.value }))}
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
                        value={wizardForm.temporary_address_province}
                        onChange={(event) =>
                          setWizardForm((prev) => ({
                            ...prev,
                            temporary_address_province: event.target.value,
                            temporary_address_city: "",
                          }))
                        }
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Street</label>
                      <Input
                        value={wizardForm.temporary_address_street}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, temporary_address_street: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">City</label>
                      <Select
                        value={wizardForm.temporary_address_city}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, temporary_address_city: event.target.value }))}
                        disabled={!wizardForm.temporary_address_province}
                      >
                        <option value="">
                          {wizardForm.temporary_address_province ? "Select city" : "Select province first"}
                        </option>
                        {cityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Postal code</label>
                      <Input
                        placeholder="A1A 1A1"
                        className={fieldErrorClass("temporary_address_postal_code")}
                        value={wizardForm.temporary_address_postal_code}
                        onChange={(event) => {
                          setWizardForm((prev) => ({
                            ...prev,
                            temporary_address_postal_code: formatCanadianPostalCode(event.target.value),
                          }));
                          clearWizardFieldError("temporary_address_postal_code");
                        }}
                      />
                      {wizardFieldErrors.temporary_address_postal_code ? (
                        <p className="mt-1 text-xs text-rose-600">{wizardFieldErrors.temporary_address_postal_code}</p>
                      ) : (
                        <p className="mt-1 text-xs text-mute">Optional. Use Canadian format A1A 1A1.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Past profession / service</label>
                    <Textarea
                      value={wizardForm.past_profession}
                      onChange={(event) => setWizardForm((prev) => ({ ...prev, past_profession: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                    <Textarea
                      value={wizardForm.notes}
                      onChange={(event) => setWizardForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="border-t border-border p-6 flex items-center justify-between">
              <Button
                variant="ghost"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((prev) => (prev > 0 ? ((prev - 1) as WizardStep) : prev))}
              >
                Back
              </Button>
              {wizardStep < 3 ? (
                <Button
                  onClick={handleWizardContinue}
                  disabled={wizardSubmitting}
                >
                  Continue
                </Button>
              ) : (
                <Button onClick={handleCreateNewcomer} disabled={wizardSubmitting}>
                  {wizardSubmitting ? "Saving..." : "Create newcomer"}
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {statusModal.open && statusModal.newcomer && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setStatusModal({ open: false, newcomer: null })}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-5 space-y-3">
              <h3 className="text-lg font-semibold">Change status</h3>
              <Select
                value={statusChoice}
                onChange={(event) => setStatusChoice(event.target.value as Newcomer["status"])}
              >
                <option value="">Select next status</option>
                {allowedStatuses(statusModal.newcomer.status).map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Select>
              <Textarea
                placeholder={
                  statusModal.newcomer.status === "Closed" || statusChoice === "Settled"
                    ? "Reason (required)"
                    : "Reason (optional)"
                }
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setStatusModal({ open: false, newcomer: null })}>
                  Cancel
                </Button>
                <Button
                  onClick={handleStatusChange}
                  disabled={
                    statusSubmitting ||
                    !statusChoice ||
                    ((statusModal.newcomer.status === "Closed" || statusChoice === "Settled") && !statusReason.trim())
                  }
                >
                  Confirm
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {assignModal.open && assignModal.newcomer && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setAssignModal({ open: false, newcomer: null })}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-5 space-y-3">
              <h3 className="text-lg font-semibold">Assign sponsor</h3>
              <div className="space-y-3">
                <div className="text-sm text-mute">
                  Current sponsor: <span className="font-medium text-ink">{assignSponsorName || "Unassigned"}</span>
                </div>
                <Input
                  value={assignSponsorQuery}
                  onChange={(event) => setAssignSponsorQuery(event.target.value)}
                  placeholder="Search member by name"
                />
                {assignSponsorLoading && <p className="text-xs text-mute">Searching members...</p>}
                {!assignSponsorLoading && assignSponsorQuery.trim() && assignSponsorResults.length === 0 && (
                  <p className="text-xs text-mute">No matching members found.</p>
                )}
                {assignSponsorResults.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                    {assignSponsorResults.map((member) => {
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
                            setAssignSponsorQuery("");
                            setAssignSponsorResults([]);
                          }}
                        >
                          <span>{name}</span>
                          {selected && <span className="text-xs font-medium">Selected</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {assignSponsorId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAssignSponsorId("");
                      setAssignSponsorName("");
                      setAssignSponsorQuery("");
                      setAssignSponsorResults([]);
                    }}
                  >
                    Clear sponsor
                  </Button>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAssignModal({ open: false, newcomer: null })}>
                  Cancel
                </Button>
                <Button onClick={handleAssign} disabled={assignSubmitting}>
                  {assignSubmitting ? "Saving..." : "Save sponsor"}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}

      {interactionModal.open && interactionModal.newcomer && (
        <>
          <div
            className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
            onClick={() => setInteractionModal({ open: false, newcomer: null })}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md p-5 space-y-3">
              <h3 className="text-lg font-semibold">Add interaction</h3>
              <Select value={interactionType} onChange={(event) => setInteractionType(event.target.value as NewcomerInteraction["interaction_type"])}>
                {INTERACTION_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Textarea
                placeholder="Interaction note"
                value={interactionNote}
                onChange={(event) => setInteractionNote(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setInteractionModal({ open: false, newcomer: null })}>
                  Cancel
                </Button>
                <Button onClick={handleInteraction} disabled={interactionSubmitting || !interactionNote.trim()}>
                  {interactionSubmitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
