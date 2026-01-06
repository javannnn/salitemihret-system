import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { getCache, setCache } from "@/lib/cache";
import {
  ApiCapabilities,
  ApiError,
  Member,
  NewcomerListResponse,
  Sponsorship,
  SponsorshipListResponse,
  SponsorshipMetrics,
  SponsorshipPayload,
  SponsorshipSponsorContext,
  StaffSummary,
  createNewcomer,
  createSponsorship,
  getApiCapabilities,
  getSponsorContext,
  getSponsorship,
  getSponsorshipMetrics,
  listNewcomers,
  listSponsorships,
  listStaff,
  searchMembers,
  transitionSponsorshipStatus,
  updateSponsorship,
} from "@/lib/api";
import { parseApiFieldErrors } from "@/lib/formErrors";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  COUNTRY_OPTIONS,
  COUNTY_OPTIONS,
  LANGUAGE_OPTIONS,
  PROVINCE_OPTIONS,
  SPONSORSHIP_FREQUENCY_OPTIONS,
  SPONSORSHIP_MOTIVATION_OPTIONS,
  SPONSORSHIP_PLEDGE_CHANNEL_OPTIONS,
  SPONSORSHIP_PROGRAM_OPTIONS,
  SPONSORSHIP_REMINDER_CHANNEL_OPTIONS,
  VOLUNTEER_SERVICE_OPTIONS,
} from "@/lib/options";
import {
  getCanonicalCanadianPhone,
  hasValidEmail,
  isLikelyPhoneNumber,
  normalizeEmailInput,
} from "@/lib/validation";

type WizardStep = 0 | 1 | 2 | 3;
type BeneficiaryMode = "newcomer_existing" | "newcomer_create" | "member" | "external";

type SponsorshipWizardForm = {
  sponsor_member_id: number | null;
  sponsor_name: string;
  beneficiary_mode: BeneficiaryMode | null;
  beneficiary_member_id: number | null;
  newcomer_id: number | null;
  beneficiary_name: string;
  program: Sponsorship["program"] | "";
  frequency: string;
  pledge_channel: Sponsorship["pledge_channel"] | "";
  reminder_channel: Sponsorship["reminder_channel"] | "";
  motivation: Sponsorship["motivation"] | "";
  volunteer_services: string[];
  volunteer_service_other: string;
  start_date: string;
  end_date: string;
  monthly_amount: string;
  budget_month: string;
  budget_year: string;
  budget_slots: string;
  notes: string;
};

type NewcomerQuickForm = {
  first_name: string;
  last_name: string;
  family_size: string;
  contact_phone: string;
  contact_email: string;
  preferred_language: string;
  interpreter_required: boolean;
  country: string;
  county: string;
  temporary_address_street: string;
  temporary_address_city: string;
  temporary_address_province: string;
  temporary_address_postal_code: string;
};
type NewcomerQuickErrors = Partial<Record<keyof NewcomerQuickForm, string>>;

type StatusModalState = {
  open: boolean;
  sponsorship: Sponsorship | null;
  nextStatus: Sponsorship["status"] | null;
  title: string;
  reasonRequired: boolean;
};

type NewcomerListItem = NewcomerListResponse["items"][number];
type SelectOption = { value: string; label: string };
type BudgetDraft = { budget_slots: string; used_slots: string; budget_amount: string };

const STATUS_STYLES: Record<Sponsorship["status"], string> = {
  Draft: "bg-slate-50 text-slate-600 border-slate-200",
  Submitted: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-sky-50 text-sky-700 border-sky-200",
  Rejected: "bg-rose-50 text-rose-600 border-rose-200",
  Active: "bg-emerald-50 text-emerald-600 border-emerald-200",
  Suspended: "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-zinc-50 text-zinc-600 border-zinc-200",
  Closed: "bg-neutral-50 text-neutral-600 border-neutral-200",
};

const PAGE_SIZE = 12;
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
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 7 }, (_, index) => CURRENT_YEAR - 1 + index);
const SLOT_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

const emptyWizardForm = (): SponsorshipWizardForm => ({
  sponsor_member_id: null,
  sponsor_name: "",
  beneficiary_mode: null,
  beneficiary_member_id: null,
  newcomer_id: null,
  beneficiary_name: "",
  program: "",
  frequency: "Monthly",
  pledge_channel: "",
  reminder_channel: "Email",
  motivation: "",
  volunteer_services: [],
  volunteer_service_other: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  monthly_amount: "150",
  budget_month: "",
  budget_year: "",
  budget_slots: "",
  notes: "",
});

const emptyNewcomerForm = (): NewcomerQuickForm => ({
  first_name: "",
  last_name: "",
  family_size: "",
  contact_phone: "",
  contact_email: "",
  preferred_language: "",
  interpreter_required: false,
  country: "",
  county: "",
  temporary_address_street: "",
  temporary_address_city: "",
  temporary_address_province: "",
  temporary_address_postal_code: "",
});

const buildSponsorContextFallback = (member: Member): SponsorshipSponsorContext => ({
  member_id: member.id,
  member_name: `${member.first_name} ${member.last_name}`.trim(),
  member_status: member.status,
  last_sponsorship_id: null,
  last_sponsorship_date: null,
  last_sponsorship_status: null,
  history_count_last_12_months: 0,
  volunteer_services: [],
  father_of_repentance_id: null,
  father_of_repentance_name: null,
  budget_usage: null,
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function beneficiaryLabel(item: Sponsorship) {
  if (item.newcomer) return `${item.newcomer.first_name} ${item.newcomer.last_name} (Newcomer)`;
  if (item.beneficiary_member) {
    return `${item.beneficiary_member.first_name} ${item.beneficiary_member.last_name} (Member)`;
  }
  return `${item.beneficiary_name} (External)`;
}

function nextActionLabel(status: Sponsorship["status"]) {
  switch (status) {
    case "Draft":
      return "Continue";
    case "Submitted":
      return "Approve or Reject";
    case "Approved":
      return "Activate";
    case "Active":
      return "Suspend or Complete";
    case "Suspended":
      return "Resume";
    case "Completed":
      return "View";
    default:
      return "View";
  }
}

function resolveOptionLabel(options: SelectOption[], value?: string | null) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}

function resolveBeneficiaryMode(record: Sponsorship): BeneficiaryMode {
  if (record.newcomer) return "newcomer_existing";
  if (record.beneficiary_member) return "member";
  return "external";
}

function mapSponsorshipToWizardForm(record: Sponsorship): SponsorshipWizardForm {
  return {
    sponsor_member_id: record.sponsor?.id ?? null,
    sponsor_name: `${record.sponsor?.first_name ?? ""} ${record.sponsor?.last_name ?? ""}`.trim(),
    beneficiary_mode: resolveBeneficiaryMode(record),
    beneficiary_member_id: record.beneficiary_member?.id ?? null,
    newcomer_id: record.newcomer?.id ?? null,
    beneficiary_name: record.beneficiary_name || "",
    program: record.program ?? "",
    frequency: record.frequency || "Monthly",
    pledge_channel: record.pledge_channel ?? "",
    reminder_channel: record.reminder_channel ?? "",
    motivation: record.motivation ?? "",
    volunteer_services: record.volunteer_services ?? [],
    volunteer_service_other: record.volunteer_service_other ?? "",
    start_date: record.start_date || new Date().toISOString().slice(0, 10),
    end_date: record.end_date || "",
    monthly_amount: record.monthly_amount ? String(record.monthly_amount) : "",
    budget_month: record.budget_month ? String(record.budget_month) : "",
    budget_year: record.budget_year ? String(record.budget_year) : "",
    budget_slots: record.budget_slots ? String(record.budget_slots) : "",
    notes: record.notes || "",
  };
}

function resolveDraftStep(record: Sponsorship): WizardStep {
  const storedRaw = localStorage.getItem(`sponsorship_draft_step_${record.id}`);
  if (storedRaw !== null && storedRaw.trim() !== "") {
    const stored = Number(storedRaw);
    if (!Number.isNaN(stored) && stored >= 0 && stored <= 3) {
      return stored as WizardStep;
    }
  }
  if (!record.beneficiary_name) {
    return 1;
  }
  const hasDetails = Boolean(
    record.program ||
      record.frequency ||
      record.pledge_channel ||
      record.reminder_channel ||
      record.motivation ||
      record.monthly_amount ||
      record.notes ||
      record.budget_month ||
      record.budget_year ||
      record.budget_slots
  );
  return hasDetails ? 2 : 1;
}

export default function SponsorshipWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canView = permissions.viewSponsorships || permissions.manageSponsorships;
  const canManage = permissions.manageSponsorships;
  const canApprove = permissions.hasRole("Admin") || permissions.isSuperAdmin;

  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState<"cases" | "budget">(
    viewParam === "budget" ? "budget" : "cases",
  );

  const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
  const [sponsorships, setSponsorships] = useState<SponsorshipListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [apiCaps, setApiCaps] = useState<ApiCapabilities | null>(null);
  const [filters, setFilters] = useState({
    status: "",
    beneficiary_type: "",
    sponsor_id: "",
    county: "",
    assigned_staff_id: "",
    created_from: "",
    created_to: "",
    q: "",
    page: 1,
  });
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [sponsorResults, setSponsorResults] = useState<Member[]>([]);
  const [sponsorSearchLoading, setSponsorSearchLoading] = useState(false);
  const [sponsorSearchError, setSponsorSearchError] = useState<string | null>(null);
  const [sponsorContextAvailable, setSponsorContextAvailable] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(0);
  const [wizardForm, setWizardForm] = useState<SponsorshipWizardForm>(emptyWizardForm);
  const [sponsorContext, setSponsorContext] = useState<SponsorshipSponsorContext | null>(null);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [draftEditingId, setDraftEditingId] = useState<number | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);

  const today = new Date();
  const [budgetMonth, setBudgetMonth] = useState(String(today.getMonth() + 1));
  const [budgetYear, setBudgetYear] = useState(String(today.getFullYear()));
  const [budgetCases, setBudgetCases] = useState<SponsorshipListResponse | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetRefreshTick, setBudgetRefreshTick] = useState(0);
  const [budgetEdits, setBudgetEdits] = useState<Record<number, BudgetDraft>>({});
  const [budgetSavingId, setBudgetSavingId] = useState<number | null>(null);

  const [beneficiarySearch, setBeneficiarySearch] = useState("");
  const [beneficiaryResults, setBeneficiaryResults] = useState<NewcomerListResponse | null>(null);
  const [beneficiaryLoading, setBeneficiaryLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<Member[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [newcomerForm, setNewcomerForm] = useState<NewcomerQuickForm>(emptyNewcomerForm);
  const [newcomerFieldErrors, setNewcomerFieldErrors] = useState<NewcomerQuickErrors>({});

  const [statusModal, setStatusModal] = useState<StatusModalState>({
    open: false,
    sponsorship: null,
    nextStatus: null,
    title: "",
    reasonRequired: false,
  });
  const [statusReason, setStatusReason] = useState("");
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const listRequestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(filters.q, 350);
  const debouncedSponsorSearch = useDebouncedValue(sponsorSearch.trim(), 300);
  const debouncedMemberSearch = useDebouncedValue(memberSearch.trim(), 300);
  const debouncedBeneficiarySearch = useDebouncedValue(beneficiarySearch.trim(), 300);

  useEffect(() => {
    getApiCapabilities()
      .then(setApiCaps)
      .catch(() => setApiCaps({ supportsStaff: true, supportsSponsorContext: true, supportsSubmittedStatus: true }));
  }, []);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (!value) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const nextView = viewParam === "budget" ? "budget" : "cases";
    if (nextView !== activeView) {
      setActiveView(nextView);
    }
  }, [viewParam, activeView]);

  const listPayload = useMemo(
    () => ({
      page: filters.page,
      page_size: PAGE_SIZE,
      status: filters.status || undefined,
      beneficiary_type: filters.beneficiary_type || undefined,
      sponsor_id: filters.sponsor_id ? Number(filters.sponsor_id) : undefined,
      county: filters.county || undefined,
      assigned_staff_id: filters.assigned_staff_id ? Number(filters.assigned_staff_id) : undefined,
      created_from: filters.created_from || undefined,
      created_to: filters.created_to || undefined,
      q: debouncedQuery || undefined,
    }),
    [
      filters.page,
      filters.status,
      filters.beneficiary_type,
      filters.sponsor_id,
      filters.county,
      filters.assigned_staff_id,
      filters.created_from,
      filters.created_to,
      debouncedQuery,
    ]
  );

  const listCacheKey = useMemo(
    () => `sponsorships:list:${JSON.stringify(listPayload)}`,
    [listPayload]
  );

  const budgetListPayload = useMemo(
    () => ({
      page: 1,
      page_size: 100,
      budget_month: budgetMonth ? Number(budgetMonth) : undefined,
      budget_year: budgetYear ? Number(budgetYear) : undefined,
    }),
    [budgetMonth, budgetYear]
  );

  const budgetCacheKey = useMemo(
    () => `sponsorships:budget:${JSON.stringify(budgetListPayload)}`,
    [budgetListPayload]
  );

  useEffect(() => {
    if (!canView) return;
    const cached = getCache<SponsorshipListResponse>(listCacheKey);
    if (cached) {
      setSponsorships(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    const requestId = ++listRequestRef.current;
    listSponsorships(listPayload)
      .then((response) => {
        if (requestId !== listRequestRef.current) return;
        setSponsorships(response);
        setCache(listCacheKey, response);
      })
      .catch((error) => {
        if (requestId !== listRequestRef.current) return;
        console.error(error);
        toast.push("Unable to load sponsorship cases.");
      })
      .finally(() => {
        if (requestId === listRequestRef.current) {
          setLoading(false);
        }
      });
  }, [listPayload, listCacheKey, canView, toast]);

  useEffect(() => {
    if (!canView || activeView !== "budget") return;
    const cached = getCache<SponsorshipListResponse>(budgetCacheKey);
    if (cached) {
      setBudgetCases(cached);
      setBudgetLoading(false);
    } else {
      setBudgetLoading(true);
    }
    let active = true;
    listSponsorships(budgetListPayload)
      .then((response) => {
        if (!active) return;
        setBudgetCases(response);
        setCache(budgetCacheKey, response);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        toast.push("Unable to load budget allocations.");
      })
      .finally(() => {
        if (active) {
          setBudgetLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [budgetListPayload, budgetCacheKey, activeView, canView, toast, budgetRefreshTick]);

  useEffect(() => {
    setBudgetEdits({});
  }, [budgetMonth, budgetYear]);

  useEffect(() => {
    if (!canView) return;
    const cachedMetrics = getCache<SponsorshipMetrics>("sponsorships:metrics", 60_000);
    if (cachedMetrics) {
      setMetrics(cachedMetrics);
    }
    getSponsorshipMetrics()
      .then((next) => {
        setMetrics(next);
        setCache("sponsorships:metrics", next);
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load sponsorship metrics.");
      });
  }, [canView, toast]);

  useEffect(() => {
    if (!canView) return;
    if (!apiCaps) return;
    if (!apiCaps.supportsStaff) return;
    const cachedStaff = getCache<StaffSummary[]>("staff:list", 5 * 60_000);
    if (cachedStaff) {
      setStaff(cachedStaff);
    }
    listStaff()
      .then((response) => {
        setStaff(response.items);
        setCache("staff:list", response.items);
      })
      .catch((error) => {
        console.error(error);
      });
  }, [canView, apiCaps]);

  useEffect(() => {
    if (!sponsorSearch.trim()) {
      setSponsorResults([]);
      setSponsorSearchError(null);
      setSponsorSearchLoading(false);
    }
  }, [sponsorSearch]);

  useEffect(() => {
    if (!debouncedSponsorSearch) return;
    let active = true;
    setSponsorSearchLoading(true);
    setSponsorSearchError(null);
    searchMembers(debouncedSponsorSearch)
      .then((results) => {
        if (active) {
          setSponsorResults(results.items.slice(0, 6));
        }
      })
      .catch(() => {
        if (active) {
          setSponsorSearchError("Unable to search members right now.");
          setSponsorResults([]);
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
  }, [debouncedSponsorSearch]);

  useEffect(() => {
    if (!memberSearch.trim() || wizardForm.beneficiary_mode !== "member") {
      setMemberResults([]);
      setMemberSearchLoading(false);
    }
  }, [memberSearch, wizardForm.beneficiary_mode]);

  useEffect(() => {
    if (!debouncedMemberSearch || wizardForm.beneficiary_mode !== "member") {
      return;
    }
    let active = true;
    setMemberSearchLoading(true);
    searchMembers(debouncedMemberSearch)
      .then((results) => {
        if (active) {
          setMemberResults(results.items.slice(0, 6));
        }
      })
      .catch(() => null)
      .finally(() => {
        if (active) {
          setMemberSearchLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [debouncedMemberSearch, wizardForm.beneficiary_mode]);

  useEffect(() => {
    if (!beneficiarySearch.trim() || wizardForm.beneficiary_mode !== "newcomer_existing") {
      setBeneficiaryResults(null);
      setBeneficiaryLoading(false);
    }
  }, [beneficiarySearch, wizardForm.beneficiary_mode]);

  useEffect(() => {
    if (!debouncedBeneficiarySearch || wizardForm.beneficiary_mode !== "newcomer_existing") {
      return;
    }
    let active = true;
    setBeneficiaryLoading(true);
    listNewcomers({ q: debouncedBeneficiarySearch, page: 1, page_size: 6 })
      .then((response) => {
        if (active) {
          setBeneficiaryResults(response);
        }
      })
      .catch(() => null)
      .finally(() => {
        if (active) {
          setBeneficiaryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [debouncedBeneficiarySearch, wizardForm.beneficiary_mode]);

  useEffect(() => {
    const draftParam = searchParams.get("draft");
    if (!draftParam) return;
    const draftId = Number(draftParam);
    if (Number.isNaN(draftId)) {
      updateSearchParams({ draft: null });
      return;
    }
    if (draftEditingId === draftId && wizardOpen) {
      return;
    }
    let active = true;
    setDraftLoading(true);
    getSponsorship(draftId)
      .then(async (record) => {
        if (!active) return;
        if (record.status !== "Draft") {
          toast.push("Only draft cases can be continued.");
          updateSearchParams({ draft: null });
          return;
        }
        setActiveView("cases");
        updateSearchParams({ view: null });
        setWizardOpen(true);
        setWizardStep(resolveDraftStep(record));
        setWizardForm(mapSponsorshipToWizardForm(record));
        setWizardError(null);
        setNewcomerFieldErrors({});
        setDraftEditingId(record.id);
        setSponsorSearch(`${record.sponsor.first_name} ${record.sponsor.last_name}`.trim());
        setSponsorResults([]);
        setSponsorContextAvailable(true);

        const beneficiaryLabel = record.newcomer
          ? `${record.newcomer.first_name} ${record.newcomer.last_name}`.trim()
          : record.beneficiary_member
            ? `${record.beneficiary_member.first_name} ${record.beneficiary_member.last_name}`.trim()
            : record.beneficiary_name || "";
        setBeneficiarySearch(record.newcomer ? beneficiaryLabel : "");
        setMemberSearch(record.beneficiary_member ? beneficiaryLabel : "");
        setBeneficiaryResults(null);
        setMemberResults([]);

        const fallbackMember = {
          id: record.sponsor.id,
          first_name: record.sponsor.first_name,
          last_name: record.sponsor.last_name,
          status: record.sponsor_status ?? "Active",
        } as Member;
        setSponsorContext(buildSponsorContextFallback(fallbackMember));

        let caps = apiCaps;
        if (!caps) {
          try {
            caps = await getApiCapabilities();
            setApiCaps(caps);
          } catch {
            caps = null;
          }
        }
        if (caps && !caps.supportsSponsorContext) {
          setSponsorContextAvailable(false);
          return;
        }
        try {
          const context = await getSponsorContext(record.sponsor.id);
          if (!active) return;
          setSponsorContext(context);
          if (context.member_status && context.member_status !== "Active") {
            setWizardError("Sponsor must be Active before creating a case.");
          }
        } catch (error) {
          if (!active) return;
          if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
            setSponsorContextAvailable(false);
            return;
          }
          console.error(error);
          toast.push("Unable to load sponsor context.");
        }
      })
      .catch((error) => {
        console.error(error);
        toast.push("Unable to open draft case.");
        updateSearchParams({ draft: null });
      })
      .finally(() => {
        if (active) {
          setDraftLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [searchParams, draftEditingId, wizardOpen, updateSearchParams, toast, apiCaps]);

  const budgetTotals = useMemo(() => {
    const items = budgetCases?.items ?? [];
    const totals = { slots: 0, used: 0, amount: 0 };
    items.forEach((item) => {
      totals.slots += item.budget_slots ?? 0;
      totals.used += item.used_slots ?? 0;
      totals.amount += item.budget_amount ?? 0;
    });
    const utilization = totals.slots > 0 ? Math.round((totals.used / totals.slots) * 1000) / 10 : 0;
    return { ...totals, utilization };
  }, [budgetCases]);

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalPages = sponsorships ? Math.ceil(sponsorships.total / PAGE_SIZE) : 1;
  const activeFilters = [
    filters.status && `Status: ${filters.status}`,
    filters.beneficiary_type && `Beneficiary: ${filters.beneficiary_type}`,
    filters.sponsor_id && `Sponsor ID: ${filters.sponsor_id}`,
    filters.county && `County: ${filters.county}`,
    filters.assigned_staff_id && `Assigned ID: ${filters.assigned_staff_id}`,
    filters.created_from && `From ${filters.created_from}`,
    filters.created_to && `To ${filters.created_to}`,
  ].filter(Boolean);

  const handleRefresh = () => {
    setFilters((prev) => ({ ...prev }));
    if (activeView === "budget") {
      setBudgetRefreshTick((prev) => prev + 1);
    }
  };

  const handleViewChange = (view: "cases" | "budget") => {
    setActiveView(view);
    updateSearchParams({ view: view === "budget" ? "budget" : null });
  };

  const handleWizardOpen = () => {
    setDraftEditingId(null);
    setActiveView("cases");
    updateSearchParams({ draft: null, view: null });
    setWizardOpen(true);
    setWizardStep(0);
    setWizardForm(emptyWizardForm());
    setWizardError(null);
    setSponsorContext(null);
    setSponsorSearch("");
    setSponsorResults([]);
    setBeneficiarySearch("");
    setBeneficiaryResults(null);
    setMemberSearch("");
    setMemberResults([]);
    setNewcomerForm(emptyNewcomerForm());
    setNewcomerFieldErrors({});
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setDraftEditingId(null);
    updateSearchParams({ draft: null });
  };

  const getBudgetDraft = useCallback(
    (item: Sponsorship): BudgetDraft => {
      return (
        budgetEdits[item.id] ?? {
          budget_slots: item.budget_slots ? String(item.budget_slots) : "",
          used_slots: item.used_slots !== undefined && item.used_slots !== null ? String(item.used_slots) : "",
          budget_amount: item.budget_amount !== null && item.budget_amount !== undefined ? String(item.budget_amount) : "",
        }
      );
    },
    [budgetEdits],
  );

  const handleBudgetFieldChange = (id: number, field: keyof BudgetDraft, value: string) => {
    setBudgetEdits((prev) => {
      const current = prev[id] ?? { budget_slots: "", used_slots: "", budget_amount: "" };
      return { ...prev, [id]: { ...current, [field]: value } };
    });
  };

  const handleBudgetSave = async (item: Sponsorship) => {
    const draft = getBudgetDraft(item);
    const nextSlots = draft.budget_slots.trim();
    const nextUsed = draft.used_slots.trim();
    const nextAmount = draft.budget_amount.trim();
    const payload: Partial<SponsorshipPayload> = {};

    if (nextSlots) {
      const parsed = Number(nextSlots);
      if (!Number.isFinite(parsed) || parsed < 1) {
        toast.push("Budget slots must be a positive number.");
        return;
      }
      payload.budget_slots = parsed;
    }
    if (nextUsed !== "") {
      const parsed = Number(nextUsed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.push("Used slots must be a non-negative number.");
        return;
      }
      const slotLimit = payload.budget_slots ?? item.budget_slots;
      if (slotLimit && parsed > slotLimit) {
        toast.push("Used slots cannot exceed budget slots.");
        return;
      }
      payload.used_slots = parsed;
    }
    if (nextAmount) {
      const parsed = Number(nextAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        toast.push("Budget amount must be greater than 0.");
        return;
      }
      payload.budget_amount = parsed;
    }
    if (Object.keys(payload).length === 0) {
      toast.push("No budget changes to save.");
      return;
    }
    setBudgetSavingId(item.id);
    try {
      const updated = await updateSponsorship(item.id, payload);
      setBudgetCases((prev) =>
        prev
          ? { ...prev, items: prev.items.map((entry) => (entry.id === updated.id ? updated : entry)) }
          : prev
      );
      setBudgetEdits((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast.push("Budget updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update budget.");
    } finally {
      setBudgetSavingId(null);
    }
  };

  const clearNewcomerFieldError = (field: keyof NewcomerQuickForm) => {
    setNewcomerFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    if (wizardError) {
      setWizardError(null);
    }
  };

  const newcomerFieldClass = (field: keyof NewcomerQuickForm) =>
    newcomerFieldErrors[field] ? "border-rose-300 focus:border-rose-500 focus:shadow-rose-200" : "";

  const handleNewcomerSelect = (newcomer: NewcomerListItem) => {
    const label = `${newcomer.first_name} ${newcomer.last_name}`.trim();
    setWizardForm((prev) => ({
      ...prev,
      beneficiary_mode: "newcomer_existing",
      newcomer_id: newcomer.id,
      beneficiary_member_id: null,
      beneficiary_name: label,
    }));
    setBeneficiarySearch(label);
    setBeneficiaryResults(null);
    setWizardError(null);
  };

  const handleMemberSelect = (member: Member) => {
    const label = `${member.first_name} ${member.last_name}`.trim();
    setWizardForm((prev) => ({
      ...prev,
      beneficiary_mode: "member",
      beneficiary_member_id: member.id,
      newcomer_id: null,
      beneficiary_name: label,
    }));
    setMemberSearch(label);
    setMemberResults([]);
    setWizardError(null);
  };

  const toggleVolunteerService = (service: string) => {
    setWizardForm((prev) => {
      const exists = prev.volunteer_services.includes(service);
      const updated = exists
        ? prev.volunteer_services.filter((item) => item !== service)
        : [...prev.volunteer_services, service];
      return { ...prev, volunteer_services: updated };
    });
  };

  const handleSponsorSelect = async (member: Member) => {
    setWizardForm((prev) => ({
      ...prev,
      sponsor_member_id: member.id,
      sponsor_name: `${member.first_name} ${member.last_name}`.trim(),
    }));
    setSponsorSearch(`${member.first_name} ${member.last_name}`.trim());
    setSponsorResults([]);
    let caps = apiCaps;
    if (!caps) {
      try {
        caps = await getApiCapabilities();
        setApiCaps(caps);
      } catch {
        caps = null;
      }
    }
    if (caps && !caps.supportsSponsorContext) {
      setSponsorContextAvailable(false);
    }
    if (!sponsorContextAvailable || (caps && !caps.supportsSponsorContext)) {
      const fallback = buildSponsorContextFallback(member);
      setSponsorContext(fallback);
      if (fallback.member_status !== "Active") {
        setWizardError("Sponsor must be Active before creating a case.");
      } else {
        setWizardError(null);
      }
      return;
    }
    try {
      const context = await getSponsorContext(member.id);
      setSponsorContext(context);
      if (context.member_status && context.member_status !== "Active") {
        setWizardError("Sponsor must be Active before creating a case.");
      } else {
        setWizardError(null);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        setSponsorContextAvailable(false);
        const fallback = buildSponsorContextFallback(member);
        setSponsorContext(fallback);
        if (fallback.member_status !== "Active") {
          setWizardError("Sponsor must be Active before creating a case.");
        } else {
          setWizardError(null);
        }
        return;
      }
      console.error(error);
      setWizardError("Unable to load sponsor context.");
    }
  };

  const sponsorBlocked = !sponsorContext || sponsorContext.member_status !== "Active";

  const isUnsupportedSubmittedError = (error: unknown) => {
    if (!(error instanceof ApiError) || error.status !== 422 || !error.body) return false;
    try {
      const payload = JSON.parse(error.body) as { detail?: Array<{ loc?: string[]; input?: string }> };
      return Boolean(
        payload.detail?.some(
          (item) => Array.isArray(item.loc) && item.loc.includes("status") && item.input === "Submitted",
        ),
      );
    } catch {
      return false;
    }
  };

  const handleCreateNewcomer = async () => {
    const fieldErrors: NewcomerQuickErrors = {};
    const firstName = newcomerForm.first_name.trim();
    const lastName = newcomerForm.last_name.trim();
    const emailInput = newcomerForm.contact_email.trim();
    const normalizedEmail = emailInput ? normalizeEmailInput(emailInput) : "";
    const phoneInput = newcomerForm.contact_phone.trim();
    const canonicalPhone = phoneInput ? getCanonicalCanadianPhone(phoneInput) : null;

    if (!firstName) {
      fieldErrors.first_name = "First name is required.";
    }
    if (!lastName) {
      fieldErrors.last_name = "Last name is required.";
    }
    if (emailInput && !hasValidEmail(normalizedEmail)) {
      fieldErrors.contact_email = "Enter a valid email address.";
    }
    if (phoneInput && !canonicalPhone && !isLikelyPhoneNumber(phoneInput)) {
      fieldErrors.contact_phone = "Enter a valid phone number (ex: +1 5551234567).";
    }
    if (newcomerForm.family_size) {
      const size = Number(newcomerForm.family_size);
      if (!Number.isInteger(size) || size < 1 || size > 20) {
        fieldErrors.family_size = "Family size must be between 1 and 20.";
      }
    }

    const missingContact = !phoneInput && !emailInput;
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    if (missingContact || hasFieldErrors) {
      setNewcomerFieldErrors(fieldErrors);
      if (missingContact) {
        setWizardError("Provide a phone or email for the newcomer.");
      } else {
        setWizardError("Fix the highlighted fields.");
      }
      return;
    }

    setWizardLoading(true);
    setWizardError(null);
    setNewcomerFieldErrors({});
    try {
      const newcomer = await createNewcomer({
        first_name: firstName,
        last_name: lastName,
        family_size: newcomerForm.family_size ? Number(newcomerForm.family_size) : undefined,
        contact_phone: canonicalPhone || phoneInput || undefined,
        contact_email: normalizedEmail || undefined,
        preferred_language: newcomerForm.preferred_language || undefined,
        interpreter_required: newcomerForm.interpreter_required,
        country: newcomerForm.country || undefined,
        county: newcomerForm.county || undefined,
        temporary_address_street: newcomerForm.temporary_address_street || undefined,
        temporary_address_city: newcomerForm.temporary_address_city || undefined,
        temporary_address_province: newcomerForm.temporary_address_province || undefined,
        temporary_address_postal_code: newcomerForm.temporary_address_postal_code || undefined,
        arrival_date: new Date().toISOString().slice(0, 10),
      });
      setWizardForm((prev) => ({
        ...prev,
        newcomer_id: newcomer.id,
        beneficiary_name: `${newcomer.first_name} ${newcomer.last_name}`.trim(),
        beneficiary_mode: "newcomer_existing",
      }));
      setWizardStep(2);
    } catch (error) {
      console.error(error);
      const parsed = parseApiFieldErrors(error);
      if (parsed) {
        setNewcomerFieldErrors(parsed.fieldErrors as NewcomerQuickErrors);
        setWizardError(parsed.formError || "Fix the highlighted fields.");
        return;
      }
      if (error instanceof ApiError) {
        setWizardError(error.body || "Unable to create newcomer.");
      } else {
        setWizardError("Unable to create newcomer.");
      }
    } finally {
      setWizardLoading(false);
    }
  };

  const handleWizardSubmit = async (status: Sponsorship["status"]) => {
    if (!wizardForm.sponsor_member_id) {
      setWizardError("Select a sponsor to continue.");
      return;
    }
    if (!wizardForm.beneficiary_mode) {
      setWizardError("Select a beneficiary to continue.");
      return;
    }
    if (!wizardForm.beneficiary_name.trim()) {
      setWizardError("Provide a beneficiary name.");
      return;
    }
    if (!wizardForm.monthly_amount.trim()) {
      setWizardError("Provide a pledge amount.");
      return;
    }
    setWizardLoading(true);
    setWizardError(null);
    const submitPayload = (statusToSend: Sponsorship["status"]) => ({
        sponsor_member_id: wizardForm.sponsor_member_id,
        beneficiary_member_id: wizardForm.beneficiary_member_id || undefined,
        newcomer_id: wizardForm.newcomer_id || undefined,
        beneficiary_name: wizardForm.beneficiary_name,
        monthly_amount: Number(wizardForm.monthly_amount),
        start_date: wizardForm.start_date || new Date().toISOString().slice(0, 10),
        end_date: wizardForm.end_date || undefined,
        frequency: wizardForm.frequency,
        program: wizardForm.program || undefined,
        pledge_channel: wizardForm.pledge_channel || undefined,
        reminder_channel: wizardForm.reminder_channel || undefined,
        motivation: wizardForm.motivation || undefined,
        volunteer_services: wizardForm.volunteer_services.length ? wizardForm.volunteer_services : undefined,
        volunteer_service_other: wizardForm.volunteer_service_other || undefined,
        budget_month: wizardForm.budget_month ? Number(wizardForm.budget_month) : undefined,
        budget_year: wizardForm.budget_year ? Number(wizardForm.budget_year) : undefined,
        budget_slots: wizardForm.budget_slots ? Number(wizardForm.budget_slots) : undefined,
        notes: wizardForm.notes || undefined,
        status: statusToSend,
      });
    try {
      const statusToSend =
        !draftEditingId && status === "Submitted" && apiCaps?.supportsSubmittedStatus === false
          ? "Active"
          : status;
      let saved: Sponsorship | null = null;
      if (draftEditingId) {
        const payload = submitPayload(statusToSend);
        const { status: _status, ...updatePayload } = payload;
        saved = await updateSponsorship(draftEditingId, updatePayload);
        if (statusToSend !== "Draft") {
          saved = await transitionSponsorshipStatus(draftEditingId, { status: statusToSend });
        }
      } else {
        saved = await createSponsorship(submitPayload(statusToSend));
      }
      if (saved) {
        if (statusToSend === "Draft") {
          localStorage.setItem(`sponsorship_draft_step_${saved.id}`, String(wizardStep));
          toast.push(draftEditingId ? "Draft updated." : "Draft saved.");
        } else {
          localStorage.removeItem(`sponsorship_draft_step_${saved.id}`);
          toast.push("Sponsorship submitted.");
        }
      }
      handleWizardClose();
      handleRefresh();
    } catch (error) {
      if (!draftEditingId && status === "Submitted" && isUnsupportedSubmittedError(error)) {
        setApiCaps((prev) =>
          prev ? { ...prev, supportsSubmittedStatus: false } : { supportsStaff: true, supportsSponsorContext: true, supportsSubmittedStatus: false },
        );
        try {
          const saved = await createSponsorship(submitPayload("Active"));
          localStorage.removeItem(`sponsorship_draft_step_${saved.id}`);
          toast.push("Sponsorship submitted.");
          handleWizardClose();
          handleRefresh();
          return;
        } catch (fallbackError) {
          console.error(fallbackError);
        }
      }
      console.error(error);
      if (error instanceof ApiError) {
        setWizardError(error.body || "Unable to save sponsorship.");
      } else {
        setWizardError("Unable to save sponsorship.");
      }
    } finally {
      setWizardLoading(false);
    }
  };

  const openStatusModal = (sponsorship: Sponsorship, nextStatus: Sponsorship["status"], title: string, reasonRequired: boolean) => {
    setStatusReason("");
    setStatusModal({ open: true, sponsorship, nextStatus, title, reasonRequired });
  };

  const handleStatusTransition = async () => {
    if (!statusModal.sponsorship || !statusModal.nextStatus) return;
    if (statusModal.reasonRequired && !statusReason.trim()) {
      return;
    }
    setStatusSubmitting(true);
    try {
      await transitionSponsorshipStatus(statusModal.sponsorship.id, {
        status: statusModal.nextStatus,
        reason: statusReason.trim() || undefined,
      });
      toast.push("Case updated.");
      setStatusModal({ open: false, sponsorship: null, nextStatus: null, title: "", reasonRequired: false });
      handleRefresh();
    } catch (error) {
      console.error(error);
      toast.push("Unable to update case.");
    } finally {
      setStatusSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sponsorship Management</h1>
          <p className="text-sm text-mute">Case-based sponsorship tracking with sponsor and beneficiary context.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant={activeView === "cases" ? "solid" : "ghost"}
              onClick={() => handleViewChange("cases")}
            >
              Cases
            </Button>
            <Button
              variant={activeView === "budget" ? "solid" : "ghost"}
              onClick={() => handleViewChange("budget")}
            >
              Budget
            </Button>
          </div>
          {draftLoading && (
            <Badge variant="outline" className="text-xs">
              Opening draft...
            </Badge>
          )}
          {activeView === "cases" && (
            <Button variant="ghost" onClick={() => setFilterOpen((prev) => !prev)}>
              <Filter className="h-4 w-4 mr-2" /> Filters
            </Button>
          )}
          <Button variant="ghost" onClick={handleRefresh}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          {canManage && (
            <Button onClick={handleWizardOpen}>
              <PlusCircle className="h-4 w-4 mr-2" /> New Sponsorship
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Active cases</p>
          <p className="text-2xl font-semibold">{metrics?.active_cases ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Submitted</p>
          <p className="text-2xl font-semibold">{metrics?.submitted_cases ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">This month executed</p>
          <p className="text-2xl font-semibold">{metrics?.month_executed ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Budget utilization</p>
          <p className="text-2xl font-semibold">
            {metrics?.budget_utilization_percent ?? "—"}
            {metrics ? "%" : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Suspended cases</p>
          <p className="text-2xl font-semibold">{metrics?.suspended_cases ?? "—"}</p>
        </Card>
      </div>

      {activeView === "cases" && (
        <>
          <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 w-full md:max-w-md">
            <Search className="h-4 w-4 text-mute" />
            <Input
              placeholder="Search sponsor or beneficiary"
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
            />
          </div>
          <Select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
          >
            <option value="">All statuses</option>
            {["Draft", "Submitted", "Approved", "Rejected", "Active", "Suspended", "Completed"].map((status) => (
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
          {filterOpen && (
            <motion.div
              className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Beneficiary type</label>
                <Select
                  value={filters.beneficiary_type}
                  onChange={(event) => setFilters((prev) => ({ ...prev, beneficiary_type: event.target.value, page: 1 }))}
                >
                  <option value="">All</option>
                  <option value="Newcomer">Newcomer</option>
                  <option value="Member">Member</option>
                  <option value="External">External</option>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Sponsor</label>
                <Input
                  placeholder="Search member"
                  value={sponsorSearch}
                  onChange={(event) => setSponsorSearch(event.target.value)}
                />
                {sponsorSearchLoading && <p className="text-xs text-mute mt-1">Searching...</p>}
                {!sponsorSearchLoading && sponsorSearchError && (
                  <p className="text-xs text-rose-600 mt-1">{sponsorSearchError}</p>
                )}
                {!sponsorSearchLoading && sponsorSearch.trim() && sponsorResults.length === 0 && !sponsorSearchError && (
                  <p className="text-xs text-mute mt-1">No matching members.</p>
                )}
                {sponsorResults.length > 0 && (
                  <div className="mt-2 border border-border rounded-xl bg-card max-h-40 overflow-y-auto">
                    {sponsorResults.map((member) => (
                      <button
                        key={member.id}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent/10"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, sponsor_id: String(member.id), page: 1 }));
                          setSponsorSearch(`${member.first_name} ${member.last_name}`.trim());
                          setSponsorResults([]);
                        }}
                      >
                        {member.first_name} {member.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">County</label>
                <Select
                  value={filters.county}
                  onChange={(event) => setFilters((prev) => ({ ...prev, county: event.target.value, page: 1 }))}
                >
                  <option value="">All counties</option>
                  {COUNTY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Assigned admin</label>
                <Select
                  value={filters.assigned_staff_id}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, assigned_staff_id: event.target.value, page: 1 }))
                  }
                >
                  <option value="">All staff</option>
                  {staff.map((person) => (
                    <option key={person.id} value={String(person.id)}>
                      {person.full_name || person.username}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Created from</label>
                <Input
                  type="date"
                  value={filters.created_from}
                  onChange={(event) => setFilters((prev) => ({ ...prev, created_from: event.target.value, page: 1 }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Created to</label>
                <Input
                  type="date"
                  value={filters.created_to}
                  onChange={(event) => setFilters((prev) => ({ ...prev, created_to: event.target.value, page: 1 }))}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
          </Card>

          <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium">Cases</p>
          <Badge variant="outline">{sponsorships?.total ?? 0} total</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-mute">
              <tr>
                <th className="px-4 py-2 text-left">Case ID</th>
                <th className="px-4 py-2 text-left">Sponsor</th>
                <th className="px-4 py-2 text-left">Beneficiary</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Last update</th>
                <th className="px-4 py-2 text-left">Next action</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading cases...
                  </td>
                </tr>
              ) : sponsorships?.items.length ? (
                sponsorships.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">SP-{String(item.id).padStart(4, "0")}</td>
                    <td className="px-4 py-2">
                      <p className="font-medium">
                        {item.sponsor.first_name} {item.sponsor.last_name}
                      </p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {item.sponsor_status || "Unknown"}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{beneficiaryLabel(item)}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                        {item.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-2">{formatDate(item.updated_at)}</td>
                    <td className="px-4 py-2 text-mute">{nextActionLabel(item.status)}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/sponsorships/${item.id}`)}>
                          View
                        </Button>
                        {canManage && item.status === "Draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateSearchParams({ draft: String(item.id), view: null })}
                          >
                            Continue
                          </Button>
                        )}
                        {canManage && item.status === "Submitted" && (
                          <>
                            <Button
                              size="sm"
                              disabled={!canApprove}
                              onClick={() => openStatusModal(item, "Approved", "Approve case", false)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!canApprove}
                              onClick={() => openStatusModal(item, "Rejected", "Reject case", true)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {canManage && item.status === "Approved" && (
                          <Button size="sm" onClick={() => openStatusModal(item, "Active", "Activate case", false)}>
                            Activate
                          </Button>
                        )}
                        {canManage && item.status === "Active" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openStatusModal(item, "Suspended", "Suspend case", false)}>
                              Suspend
                            </Button>
                            <Button size="sm" onClick={() => openStatusModal(item, "Completed", "Complete case", false)}>
                              Complete
                            </Button>
                          </>
                        )}
                        {canManage && item.status === "Suspended" && (
                          <Button size="sm" onClick={() => openStatusModal(item, "Active", "Resume case", false)}>
                            Resume
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                    No cases found.
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
        </>
      )}

      {activeView === "budget" && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Budget month</label>
                <Select
                  value={budgetMonth}
                  onChange={(event) => setBudgetMonth(event.target.value)}
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Budget year</label>
                <Select
                  value={budgetYear}
                  onChange={(event) => setBudgetYear(event.target.value)}
                >
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="ghost" onClick={() => setBudgetRefreshTick((prev) => prev + 1)}>
                Refresh budget
              </Button>
            </div>
            <p className="mt-3 text-xs text-mute">
              Manage budget slots and amounts for cases in the selected period.
            </p>
          </Card>

          <div className="grid gap-3 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Total slots</p>
              <p className="text-2xl font-semibold">{budgetTotals.slots}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Used slots</p>
              <p className="text-2xl font-semibold">{budgetTotals.used}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Utilization</p>
              <p className="text-2xl font-semibold">{budgetTotals.utilization}%</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs uppercase text-mute">Total budget</p>
              <p className="text-2xl font-semibold">
                ${budgetTotals.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium">Budgeted cases</p>
              <Badge variant="outline">{budgetCases?.total ?? 0} total</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-mute">
                  <tr>
                    <th className="px-4 py-2 text-left">Case ID</th>
                    <th className="px-4 py-2 text-left">Sponsor</th>
                    <th className="px-4 py-2 text-left">Beneficiary</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Budget slots</th>
                    <th className="px-4 py-2 text-left">Used slots</th>
                    <th className="px-4 py-2 text-left">Budget amount</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                        <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                        Loading budget...
                      </td>
                    </tr>
                  ) : budgetCases?.items.length ? (
                    budgetCases.items.map((item) => {
                      const draft = getBudgetDraft(item);
                      const saving = budgetSavingId === item.id;
                      return (
                        <tr key={item.id} className="border-t border-border/60">
                          <td className="px-4 py-2 font-medium">SP-{String(item.id).padStart(4, "0")}</td>
                          <td className="px-4 py-2">
                            {item.sponsor.first_name} {item.sponsor.last_name}
                          </td>
                          <td className="px-4 py-2">{beneficiaryLabel(item)}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                              {item.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={1}
                              value={draft.budget_slots}
                              onChange={(event) => handleBudgetFieldChange(item.id, "budget_slots", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={0}
                              value={draft.used_slots}
                              onChange={(event) => handleBudgetFieldChange(item.id, "used_slots", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.budget_amount}
                              onChange={(event) => handleBudgetFieldChange(item.id, "budget_amount", event.target.value)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Button
                              size="sm"
                              onClick={() => handleBudgetSave(item)}
                              disabled={saving}
                            >
                              {saving ? "Saving..." : "Save"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                        No budgeted cases found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <AnimatePresence>
        {wizardOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleWizardClose}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-card border-l border-border z-50 flex flex-col"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-mute">Step {wizardStep + 1} of 4</p>
                  <h2 className="text-xl font-semibold">
                    {draftEditingId ? `Resume draft SP-${String(draftEditingId).padStart(4, "0")}` : "New sponsorship case"}
                  </h2>
                </div>
                <Button variant="ghost" onClick={handleWizardClose}>
                  Close
                </Button>
              </div>
              <div className="px-6 py-4 space-y-6 overflow-y-auto">
                {wizardStep === 0 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Sponsor search</label>
                    <Input
                      placeholder="Search member by name"
                      value={sponsorSearch}
                      onChange={(event) => setSponsorSearch(event.target.value)}
                    />
                    {sponsorSearchLoading && <p className="text-xs text-mute mt-1">Searching...</p>}
                    {!sponsorSearchLoading && sponsorSearchError && (
                      <p className="text-xs text-rose-600 mt-1">{sponsorSearchError}</p>
                    )}
                    {!sponsorSearchLoading && sponsorSearch.trim() && sponsorResults.length === 0 && !sponsorSearchError && (
                      <p className="text-xs text-mute mt-1">No matching members.</p>
                    )}
                    {sponsorResults.length > 0 && (
                      <div className="mt-2 border border-border rounded-xl bg-card max-h-48 overflow-y-auto">
                        {sponsorResults.map((member) => (
                          <button
                              key={member.id}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent/10"
                              onClick={() => handleSponsorSelect(member)}
                            >
                              {member.first_name} {member.last_name} • {member.status}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {sponsorContext && (
                      <Card className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{sponsorContext.member_name}</p>
                          <Badge variant="outline">{sponsorContext.member_status || "Unknown"}</Badge>
                        </div>
                        <div className="text-sm text-mute">
                          Last sponsorship: {sponsorContext.last_sponsorship_status || "None"} •{" "}
                          {formatDate(sponsorContext.last_sponsorship_date)}
                        </div>
                        <div className="text-sm text-mute">
                          Sponsorships (last 12 months): {sponsorContext.history_count_last_12_months}
                        </div>
                        <div className="text-sm text-mute">
                          Volunteer services: {sponsorContext.volunteer_services.length ? sponsorContext.volunteer_services.join(", ") : "None"}
                        </div>
                        <div className="text-sm text-mute">
                          Father of repentance: {sponsorContext.father_of_repentance_name || "Not set"}
                        </div>
                        {sponsorContext.budget_usage && (
                          <div className="text-sm text-mute">
                            Budget usage: {sponsorContext.budget_usage.used_slots}/{sponsorContext.budget_usage.total_slots}
                          </div>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/members/${sponsorContext.member_id}/edit`)}>
                          View member profile
                        </Button>
                      </Card>
                    )}

                    {wizardError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/80 text-xs text-rose-800 p-3">
                        {wizardError}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={handleWizardClose}>
                        Cancel
                      </Button>
                      <Button
                        disabled={!wizardForm.sponsor_member_id || sponsorBlocked}
                        onClick={() => setWizardStep(1)}
                      >
                        Continue <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <Card
                        className={`p-4 cursor-pointer border-2 ${wizardForm.beneficiary_mode === "newcomer_existing" ? "border-accent" : "border-border"}`}
                        onClick={() => setWizardForm((prev) => ({ ...prev, beneficiary_mode: "newcomer_existing" }))}
                      >
                        <p className="font-medium">Link existing newcomer</p>
                        <p className="text-xs text-mute">Search and select a current newcomer.</p>
                      </Card>
                      <Card
                        className={`p-4 cursor-pointer border-2 ${wizardForm.beneficiary_mode === "newcomer_create" ? "border-accent" : "border-border"}`}
                        onClick={() => setWizardForm((prev) => ({ ...prev, beneficiary_mode: "newcomer_create" }))}
                      >
                        <p className="font-medium">Create newcomer now</p>
                        <p className="text-xs text-mute">Quick intake and link the case.</p>
                      </Card>
                      <Card
                        className={`p-4 cursor-pointer border-2 ${wizardForm.beneficiary_mode === "member" || wizardForm.beneficiary_mode === "external" ? "border-accent" : "border-border"}`}
                        onClick={() => setWizardForm((prev) => ({ ...prev, beneficiary_mode: "member" }))}
                      >
                        <p className="font-medium">External or member</p>
                        <p className="text-xs text-mute">Select a member or enter external beneficiary.</p>
                      </Card>
                    </div>

                    {wizardForm.beneficiary_mode === "newcomer_existing" && (
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Search newcomer</label>
                        <Input
                          placeholder="Search by name"
                          value={beneficiarySearch}
                          onChange={(event) => setBeneficiarySearch(event.target.value)}
                        />
                        {beneficiaryLoading && <p className="text-xs text-mute mt-1">Searching...</p>}
                        {beneficiaryResults?.items?.length ? (
                          <div className="mt-2 border border-border rounded-xl bg-card max-h-40 overflow-y-auto relative z-10">
                            {beneficiaryResults.items.map((newcomer) => (
                              <button
                                key={newcomer.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${
                                  wizardForm.newcomer_id === newcomer.id ? "bg-accent/10" : ""
                                }`}
                                onClick={() => handleNewcomerSelect(newcomer)}
                              >
                                {newcomer.first_name} {newcomer.last_name} • {newcomer.status}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {wizardForm.beneficiary_mode === "newcomer_create" && (
                      <Card className="p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Input
                              placeholder="First name"
                              value={newcomerForm.first_name}
                              className={newcomerFieldClass("first_name")}
                              onChange={(event) => {
                                setNewcomerForm((prev) => ({ ...prev, first_name: event.target.value }));
                                clearNewcomerFieldError("first_name");
                              }}
                            />
                            {newcomerFieldErrors.first_name && (
                              <p className="mt-1 text-xs text-rose-600">{newcomerFieldErrors.first_name}</p>
                            )}
                          </div>
                          <div>
                            <Input
                              placeholder="Last name"
                              value={newcomerForm.last_name}
                              className={newcomerFieldClass("last_name")}
                              onChange={(event) => {
                                setNewcomerForm((prev) => ({ ...prev, last_name: event.target.value }));
                                clearNewcomerFieldError("last_name");
                              }}
                            />
                            {newcomerFieldErrors.last_name && (
                              <p className="mt-1 text-xs text-rose-600">{newcomerFieldErrors.last_name}</p>
                            )}
                          </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Input
                              type="number"
                              min={1}
                              placeholder="Family size"
                              value={newcomerForm.family_size}
                              className={newcomerFieldClass("family_size")}
                              onChange={(event) => {
                                setNewcomerForm((prev) => ({ ...prev, family_size: event.target.value }));
                                clearNewcomerFieldError("family_size");
                              }}
                            />
                            {newcomerFieldErrors.family_size && (
                              <p className="mt-1 text-xs text-rose-600">{newcomerFieldErrors.family_size}</p>
                            )}
                          </div>
                          <Select
                            value={newcomerForm.county}
                            onChange={(event) => setNewcomerForm((prev) => ({ ...prev, county: event.target.value }))}
                          >
                            <option value="">Select county</option>
                            {COUNTY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            value={newcomerForm.country}
                            onChange={(event) => setNewcomerForm((prev) => ({ ...prev, country: event.target.value }))}
                          >
                            <option value="">Select country</option>
                            {COUNTRY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <Select
                            value={newcomerForm.preferred_language}
                            onChange={(event) => setNewcomerForm((prev) => ({ ...prev, preferred_language: event.target.value }))}
                          >
                            <option value="">Preferred language</option>
                            {LANGUAGE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <Input
                              type="tel"
                              inputMode="tel"
                              placeholder="Phone"
                              value={newcomerForm.contact_phone}
                              className={newcomerFieldClass("contact_phone")}
                              onChange={(event) => {
                                setNewcomerForm((prev) => ({ ...prev, contact_phone: event.target.value }));
                                clearNewcomerFieldError("contact_phone");
                              }}
                            />
                            {newcomerFieldErrors.contact_phone && (
                              <p className="mt-1 text-xs text-rose-600">{newcomerFieldErrors.contact_phone}</p>
                            )}
                          </div>
                          <div>
                            <Input
                              type="email"
                              inputMode="email"
                              placeholder="Email"
                              value={newcomerForm.contact_email}
                              className={newcomerFieldClass("contact_email")}
                              onChange={(event) => {
                                setNewcomerForm((prev) => ({ ...prev, contact_email: event.target.value }));
                                clearNewcomerFieldError("contact_email");
                              }}
                            />
                            {newcomerFieldErrors.contact_email && (
                              <p className="mt-1 text-xs text-rose-600">{newcomerFieldErrors.contact_email}</p>
                            )}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-mute">
                          <input
                            type="checkbox"
                            checked={newcomerForm.interpreter_required}
                            onChange={(event) =>
                              setNewcomerForm((prev) => ({ ...prev, interpreter_required: event.target.checked }))
                            }
                          />
                          Interpreter required
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Input
                            placeholder="Temp address street"
                            value={newcomerForm.temporary_address_street}
                            onChange={(event) =>
                              setNewcomerForm((prev) => ({ ...prev, temporary_address_street: event.target.value }))
                            }
                          />
                          <Input
                            placeholder="Temp address city"
                            value={newcomerForm.temporary_address_city}
                            onChange={(event) =>
                              setNewcomerForm((prev) => ({ ...prev, temporary_address_city: event.target.value }))
                            }
                          />
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select
                            value={newcomerForm.temporary_address_province}
                            onChange={(event) =>
                              setNewcomerForm((prev) => ({ ...prev, temporary_address_province: event.target.value }))
                            }
                          >
                            <option value="">Select province</option>
                            {PROVINCE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          <Input
                            placeholder="Postal code"
                            value={newcomerForm.temporary_address_postal_code}
                            onChange={(event) =>
                              setNewcomerForm((prev) => ({ ...prev, temporary_address_postal_code: event.target.value }))
                            }
                          />
                        </div>
                        {wizardError && (
                          <div className="rounded-xl border border-rose-200 bg-rose-50/80 text-xs text-rose-800 p-3">
                            {wizardError}
                          </div>
                        )}
                        <Button onClick={handleCreateNewcomer} disabled={wizardLoading}>
                          {wizardLoading ? "Saving..." : "Create newcomer"}
                        </Button>
                      </Card>
                    )}

                    {wizardForm.beneficiary_mode === "member" && (
                      <div className="space-y-3">
                        <label className="text-xs uppercase text-mute block">Member search</label>
                        <Input
                          placeholder="Search member"
                          value={memberSearch}
                          onChange={(event) => setMemberSearch(event.target.value)}
                        />
                        {memberSearchLoading && <p className="text-xs text-mute">Searching...</p>}
                        {memberResults.length > 0 && (
                          <div className="border border-border rounded-xl bg-card max-h-40 overflow-y-auto relative z-10">
                            {memberResults.map((member) => (
                              <button
                                key={member.id}
                                type="button"
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${
                                  wizardForm.beneficiary_member_id === member.id ? "bg-accent/10" : ""
                                }`}
                                onClick={() => handleMemberSelect(member)}
                              >
                                {member.first_name} {member.last_name} • {member.status}
                              </button>
                            ))}
                          </div>
                        )}
                        <Button variant="ghost" onClick={() => setWizardForm((prev) => ({ ...prev, beneficiary_mode: "external" }))}>
                          Use external beneficiary instead
                        </Button>
                      </div>
                    )}

                    {wizardForm.beneficiary_mode === "external" && (
                      <div className="space-y-3">
                        <label className="text-xs uppercase text-mute block">External beneficiary name</label>
                        <Input
                          placeholder="Beneficiary name"
                          value={wizardForm.beneficiary_name}
                          onChange={(event) =>
                            setWizardForm((prev) => ({ ...prev, beneficiary_name: event.target.value }))
                          }
                        />
                        <Button variant="ghost" onClick={() => setWizardForm((prev) => ({ ...prev, beneficiary_mode: "member" }))}>
                          Switch to member selection
                        </Button>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setWizardStep(0)}>
                        Back
                      </Button>
                      <Button onClick={() => setWizardStep(2)} disabled={!wizardForm.beneficiary_name.trim()}>
                        Continue <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Case summary / notes</label>
                      <Textarea
                        rows={4}
                        value={wizardForm.notes}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, notes: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        value={wizardForm.program}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, program: event.target.value as Sponsorship["program"] | "" }))}
                      >
                        <option value="">Select program</option>
                        {SPONSORSHIP_PROGRAM_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={wizardForm.frequency}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, frequency: event.target.value }))}
                      >
                        <option value="">Select frequency</option>
                        {SPONSORSHIP_FREQUENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        value={wizardForm.pledge_channel}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, pledge_channel: event.target.value as Sponsorship["pledge_channel"] | "" }))}
                      >
                        <option value="">Pledge channel</option>
                        {SPONSORSHIP_PLEDGE_CHANNEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={wizardForm.reminder_channel}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, reminder_channel: event.target.value as Sponsorship["reminder_channel"] | "" }))}
                      >
                        <option value="">Reminder channel</option>
                        {SPONSORSHIP_REMINDER_CHANNEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        value={wizardForm.motivation}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, motivation: event.target.value as Sponsorship["motivation"] | "" }))}
                      >
                        <option value="">Motivation</option>
                        {SPONSORSHIP_MOTIVATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min={1}
                        placeholder="Pledge amount"
                        value={wizardForm.monthly_amount}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, monthly_amount: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Input
                        type="date"
                        value={wizardForm.start_date}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, start_date: event.target.value }))}
                      />
                      <Input
                        type="date"
                        value={wizardForm.end_date}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, end_date: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Volunteer services</label>
                      <div className="grid gap-2 md:grid-cols-2">
                        {VOLUNTEER_SERVICE_OPTIONS.map((option) => (
                          <label key={option.value} className="flex items-center gap-2 text-sm text-mute">
                            <input
                              type="checkbox"
                              checked={wizardForm.volunteer_services.includes(option.value)}
                              onChange={() => toggleVolunteerService(option.value)}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                      <Input
                        className="mt-2"
                        placeholder="Other volunteer service (optional)"
                        value={wizardForm.volunteer_service_other}
                        onChange={(event) =>
                          setWizardForm((prev) => ({ ...prev, volunteer_service_other: event.target.value }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Select
                        value={wizardForm.budget_month}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, budget_month: event.target.value }))}
                      >
                        <option value="">Budget month</option>
                        {MONTH_OPTIONS.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={wizardForm.budget_year}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, budget_year: event.target.value }))}
                      >
                        <option value="">Budget year</option>
                        {YEAR_OPTIONS.map((year) => (
                          <option key={year} value={String(year)}>
                            {year}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={wizardForm.budget_slots}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, budget_slots: event.target.value }))}
                      >
                        <option value="">Budget slots</option>
                        {SLOT_OPTIONS.map((slot) => (
                          <option key={slot} value={String(slot)}>
                            {slot}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setWizardStep(1)}>
                        Back
                      </Button>
                      <Button onClick={() => setWizardStep(3)}>
                        Continue <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <Card className="p-4 space-y-2">
                      <p className="text-xs uppercase text-mute">Sponsor</p>
                      <p className="font-medium">{wizardForm.sponsor_name || "—"}</p>
                      <p className="text-xs uppercase text-mute mt-3">Beneficiary</p>
                      <p className="font-medium">{wizardForm.beneficiary_name || "—"}</p>
                      <p className="text-xs uppercase text-mute mt-3">Program</p>
                      <p className="font-medium">
                        {resolveOptionLabel(SPONSORSHIP_PROGRAM_OPTIONS, wizardForm.program)}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Frequency</p>
                      <p className="font-medium">
                        {resolveOptionLabel(SPONSORSHIP_FREQUENCY_OPTIONS, wizardForm.frequency)}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Pledge channel</p>
                      <p className="font-medium">
                        {resolveOptionLabel(SPONSORSHIP_PLEDGE_CHANNEL_OPTIONS, wizardForm.pledge_channel)}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Reminder channel</p>
                      <p className="font-medium">
                        {resolveOptionLabel(SPONSORSHIP_REMINDER_CHANNEL_OPTIONS, wizardForm.reminder_channel)}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Motivation</p>
                      <p className="font-medium">
                        {resolveOptionLabel(SPONSORSHIP_MOTIVATION_OPTIONS, wizardForm.motivation)}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Volunteer services</p>
                      <p className="font-medium">
                        {[
                          ...wizardForm.volunteer_services.map((service) =>
                            resolveOptionLabel(VOLUNTEER_SERVICE_OPTIONS, service),
                          ),
                          wizardForm.volunteer_service_other,
                        ]
                          .map((value) => value?.trim())
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Start date</p>
                      <p className="font-medium">{formatDate(wizardForm.start_date)}</p>
                      <p className="text-xs uppercase text-mute mt-3">Expected end</p>
                      <p className="font-medium">{formatDate(wizardForm.end_date)}</p>
                      <p className="text-xs uppercase text-mute mt-3">Notes</p>
                      <p className="text-sm text-mute whitespace-pre-line">{wizardForm.notes || "—"}</p>
                    </Card>

                    {wizardError && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/80 text-xs text-rose-800 p-3">
                        {wizardError}
                      </div>
                    )}

                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setWizardStep(2)}>
                        Back
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" disabled={wizardLoading} onClick={() => handleWizardSubmit("Draft")}>
                          {draftEditingId ? "Update draft" : "Save draft"}
                        </Button>
                        <Button disabled={wizardLoading} onClick={() => handleWizardSubmit("Submitted")}>
                          Submit
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {statusModal.open && statusModal.sponsorship && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setStatusModal({ open: false, sponsorship: null, nextStatus: null, title: "", reasonRequired: false })}
            />
            <motion.div
              className="fixed inset-x-0 top-24 mx-auto w-full max-w-lg bg-card border border-border rounded-2xl z-50 p-6 space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{statusModal.title}</h3>
                <Button
                  variant="ghost"
                  onClick={() => setStatusModal({ open: false, sponsorship: null, nextStatus: null, title: "", reasonRequired: false })}
                >
                  Close
                </Button>
              </div>
              {statusModal.reasonRequired && (
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Reason</label>
                  <Textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={4} />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setStatusModal({ open: false, sponsorship: null, nextStatus: null, title: "", reasonRequired: false })}
                >
                  Cancel
                </Button>
                <Button onClick={handleStatusTransition} disabled={statusSubmitting}>
                  {statusSubmitting ? "Updating..." : "Confirm"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
