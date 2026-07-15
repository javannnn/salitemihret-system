import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  Filter,
  HeartHandshake,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { PhoneInput } from "@/components/PhoneInput";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { useTour } from "@/context/TourContext";
import { clearCachePrefix, getCache, setCache } from "@/lib/cache";
import {
  ApiCapabilities,
  ApiError,
  ContributionPayment,
  Member,
  NewcomerListResponse,
  Sponsorship,
  SponsorshipBudgetRound,
  SponsorshipListResponse,
  SponsorshipMetrics,
  SponsorshipPayload,
  SponsorshipPrescreeningItem,
  SponsorshipPrescreeningResponse,
  SponsorshipSponsorContext,
  StaffSummary,
  createSponsorshipBudgetRound,
  createNewcomer,
  createSponsorship,
  deleteSponsorship,
  exportSponsorshipPrescreeningExcel,
  exportSponsorshipsCsv,
  exportSponsorshipsExcel,
  deleteSponsorshipBudgetRound,
  getApiCapabilities,
  getSponsorContext,
  getSponsorship,
  getSponsorshipMetrics,
  listSponsorshipBudgetRounds,
  listNewcomers,
  listSponsorshipPrescreening,
  listSponsorships,
  parseApiErrorMessage,
  listStaff,
  searchMembers,
  transitionSponsorshipStatus,
  updateSponsorshipBudgetRound,
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
  formatCanadianPostalCode,
  getCanonicalCanadianPhone,
  getCanadianPhoneSnapSuggestion,
  getCanadianPhoneValidationMessage,
  getCanadianPostalCodeValidationMessage,
  hasValidEmail,
  normalizeEmailInput,
} from "@/lib/validation";

type WizardStep = 0 | 1 | 2 | 3;
type BeneficiaryMode = "external";

type SponsorshipWizardForm = {
  sponsor_member_id: number | null;
  sponsor_name: string;
  beneficiary_mode: BeneficiaryMode | null;
  beneficiary_member_id: number | null;
  newcomer_id: number | null;
  beneficiary_name: string;
  beneficiary_first_name: string;
  beneficiary_last_name: string;
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
  last_sponsored_date: string;
  payment_information: string;
  last_status: Sponsorship["last_status"] | "";
  last_status_reason: string;
  budget_month: string;
  budget_year: string;
  budget_round_id: string;
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
type BudgetDraft = { budget_slots: string; budget_round_id: string };
type BudgetRoundDraft = {
  round_number: string;
  start_date: string;
  end_date: string;
  slot_budget: string;
};

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

const PRESCREEN_ELIGIBILITY_STYLES: Record<SponsorshipPrescreeningItem["eligibility"], string> = {
  Eligible: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Review: "border-amber-200 bg-amber-50 text-amber-700",
  NotEligible: "border-rose-200 bg-rose-50 text-rose-700",
};

const PRESCREEN_CRITERION_STYLES = {
  Pass: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Review: "border-amber-200 bg-amber-50 text-amber-700",
  Fail: "border-rose-200 bg-rose-50 text-rose-700",
};

const BUDGET_CONSUMING_STATUSES = new Set<Sponsorship["status"]>([
  "Submitted",
  "Approved",
  "Active",
  "Suspended",
  "Completed",
  "Closed",
]);

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
const ROUND_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const SLOT_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);

const emptyWizardForm = (): SponsorshipWizardForm => ({
  sponsor_member_id: null,
  sponsor_name: "",
  beneficiary_mode: "external",
  beneficiary_member_id: null,
  newcomer_id: null,
  beneficiary_name: "",
  beneficiary_first_name: "",
  beneficiary_last_name: "",
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
  last_sponsored_date: "",
  payment_information: "",
  last_status: "",
  last_status_reason: "",
  budget_month: "",
  budget_year: "",
  budget_round_id: "",
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
  member_phone: member.phone ?? null,
  member_email: member.email ?? null,
  marital_status: member.marital_status ?? null,
  spouse_name: null,
  spouse_phone: null,
  spouse_email: null,
  last_sponsorship_id: null,
  last_sponsorship_date: null,
  last_sponsorship_name: null,
  last_sponsorship_status: null,
  history_count_last_12_months: 0,
  volunteer_services: [],
  father_of_repentance_id: null,
  father_of_repentance_name: null,
  budget_usage: null,
  payment_history_start: null,
  payment_history_end: null,
  payment_history: [],
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function eligibilityLabel(value: SponsorshipPrescreeningItem["eligibility"]) {
  return value === "NotEligible" ? "Not eligible" : value;
}

function tenureLabel(months?: number | null) {
  if (months === null || months === undefined) return "Start date missing";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (!years) return `${remainingMonths} mo`;
  return remainingMonths ? `${years} yr ${remainingMonths} mo` : `${years} yr`;
}

function PrescreenCriterionIcon({ status }: { status: "Pass" | "Review" | "Fail" }) {
  if (status === "Pass") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "Fail") return <XCircle className="h-3.5 w-3.5" />;
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

type PaymentContinuityMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
  paid: boolean;
  paymentCount: number;
  latestPaidAt?: string;
};

type PaymentContinuitySegment = {
  label: string;
  months: PaymentContinuityMonth[];
  paidMonths: number;
};

type PaymentContinuitySummary = {
  segments: PaymentContinuitySegment[];
  totalMonths: number;
  paidMonths: number;
  missedMonths: number;
  continuityPercent: number;
  lastPaymentAt?: string;
};

type PaymentContinuityOptions = {
  startDate?: string | null;
  endDate?: string | null;
  months?: number;
};

const parseDateInput = (value?: string | null) => {
  if (!value) return null;
  const [yearStr, monthStr, dayStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr ?? "1");
  if (!year || !month) return null;
  return new Date(year, month - 1, day || 1);
};

const countMonthsInclusive = (start: Date, end: Date) =>
  (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

const buildPaymentContinuity = (
  payments: ContributionPayment[],
  options: PaymentContinuityOptions = {},
): PaymentContinuitySummary => {
  const endDate = parseDateInput(options.endDate) ?? new Date();
  const startDate = parseDateInput(options.startDate);
  const totalMonths = startDate
    ? Math.max(1, countMonthsInclusive(startDate, endDate))
    : Math.max(1, options.months ?? 36);

  const monthMap = new Map<string, { count: number; latestPaidAt: string }>();
  let lastPaymentAt: string | undefined;
  payments.forEach((payment) => {
    const paidDate = parseDateInput(payment.paid_at);
    if (!paidDate) return;
    const monthNumber = paidDate.getMonth() + 1;
    const key = `${paidDate.getFullYear()}-${String(monthNumber).padStart(2, "0")}`;
    const existing = monthMap.get(key);
    if (!existing) {
      monthMap.set(key, { count: 1, latestPaidAt: payment.paid_at });
    } else {
      existing.count += 1;
      if (existing.latestPaidAt < payment.paid_at) {
        existing.latestPaidAt = payment.paid_at;
      }
    }
    if (!lastPaymentAt || lastPaymentAt < payment.paid_at) {
      lastPaymentAt = payment.paid_at;
    }
  });

  const months: PaymentContinuityMonth[] = [];
  for (let i = totalMonths - 1; i >= 0; i--) {
    const date = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const monthNumber = monthIndex + 1;
    const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const entry = monthMap.get(key);
    months.push({
      key,
      year,
      month: monthNumber,
      label: date.toLocaleString(undefined, { month: "short" }),
      paid: Boolean(entry),
      paymentCount: entry?.count ?? 0,
      latestPaidAt: entry?.latestPaidAt,
    });
  }

  const segments: PaymentContinuitySegment[] = [];
  for (let i = 0; i < months.length; i += 12) {
    const slice = months.slice(i, i + 12);
    if (!slice.length) continue;
    const start = slice[0];
    const end = slice[slice.length - 1];
    segments.push({
      label: `${start.label} ${start.year} – ${end.label} ${end.year}`,
      months: slice,
      paidMonths: slice.filter((month) => month.paid).length,
    });
  }

  const paidMonths = months.filter((month) => month.paid).length;
  const totalMonthsNormalized = months.length || totalMonths;
  const continuityPercent = Math.round((paidMonths / totalMonthsNormalized) * 100);
  return {
    segments,
    totalMonths: totalMonthsNormalized,
    paidMonths,
    missedMonths: totalMonthsNormalized - paidMonths,
    continuityPercent,
    lastPaymentAt,
  };
};

function beneficiaryLabel(item: Sponsorship) {
  if (item.newcomer) return `${item.newcomer.first_name} ${item.newcomer.last_name}`;
  if (item.beneficiary_member) {
    return `${item.beneficiary_member.first_name} ${item.beneficiary_member.last_name}`;
  }
  return item.beneficiary_name;
}

function statusLabel(status: Sponsorship["status"]) {
  return status === "Suspended" ? "Declined" : status;
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
      return "Decline or Complete";
    case "Suspended":
      return "Resume";
    case "Completed":
      return "Reverse";
    case "Rejected":
      return "Delete";
    default:
      return "View";
  }
}

function canDeleteSponsorshipCase(item: Sponsorship) {
  return (item.status === "Suspended" || item.status === "Rejected") && Boolean(item.rejection_reason?.trim());
}

function resolveOptionLabel(options: SelectOption[], value?: string | null) {
  if (!value) return "—";
  return options.find((option) => option.value === value)?.label ?? value;
}

function resolveBeneficiaryMode(record: Sponsorship): BeneficiaryMode {
  return "external";
}

function splitManualBeneficiaryName(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { firstName: parts[0] || "", lastName: "" };
  }
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function mapSponsorshipToWizardForm(record: Sponsorship): SponsorshipWizardForm {
  const mode = resolveBeneficiaryMode(record);
  const manualName = splitManualBeneficiaryName(record.beneficiary_name);
  return {
    sponsor_member_id: record.sponsor?.id ?? null,
    sponsor_name: `${record.sponsor?.first_name ?? ""} ${record.sponsor?.last_name ?? ""}`.trim(),
    beneficiary_mode: mode,
    beneficiary_member_id: null,
    newcomer_id: null,
    beneficiary_name: record.beneficiary_name || "",
    beneficiary_first_name: manualName.firstName,
    beneficiary_last_name: manualName.lastName,
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
    last_sponsored_date: record.last_sponsored_date || "",
    payment_information: record.payment_information || "",
    last_status: record.last_status ?? "",
    last_status_reason: record.last_status_reason || "",
    budget_month: record.budget_month ? String(record.budget_month) : "",
    budget_year: record.budget_year ? String(record.budget_year) : "",
    budget_round_id: record.budget_round_id ? String(record.budget_round_id) : "",
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
      record.last_sponsored_date ||
      record.payment_information ||
      record.last_status ||
      record.last_status_reason ||
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
  const tour = useTour();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canView = permissions.viewSponsorships || permissions.manageSponsorships;
  const canManage = permissions.manageSponsorships;
  const canViewBudgetRoundAdmin =
    permissions.canReadField("sponsorships", "budget_rounds") ||
    permissions.canWriteField("sponsorships", "budget_rounds") ||
    permissions.hasRole("FinanceAdmin") ||
    permissions.hasRole("Admin") ||
    permissions.isSuperAdmin;
  const canManageBudgetRounds =
    permissions.canWriteField("sponsorships", "budget_rounds") ||
    permissions.hasRole("FinanceAdmin") ||
    permissions.hasRole("Admin") ||
    permissions.isSuperAdmin;
  const canApprove = permissions.hasRole("Admin") || permissions.isSuperAdmin;
  const permissionLabel = (moduleLabel: string, actionLabel: "Read" | "Write", fieldLabel?: string) =>
    fieldLabel ? `${moduleLabel} > ${fieldLabel}: ${actionLabel}` : `${moduleLabel}: ${actionLabel}`;
  const formatPermissionRequest = useCallback(
    (requiredPermissions: string[]) => [...new Set(requiredPermissions.filter(Boolean))].join(", "),
    []
  );
  const permissionMessage = useCallback(
    (action: string, requiredPermissions: string[]) => {
      const permissionRequest = formatPermissionRequest(requiredPermissions);
      return permissionRequest
        ? `You do not have permission to ${action}. Ask your admin to enable: ${permissionRequest}.`
        : `You do not have permission to ${action}.`;
    },
    [formatPermissionRequest]
  );
  const membersReadPermission = permissionLabel("Members", "Read");
  const newcomersReadPermission = permissionLabel("Newcomers", "Read");
  const newcomersWritePermission = permissionLabel("Newcomers", "Write");
  const newcomerFirstNameWritePermission = permissionLabel("Newcomers", "Write", "First Name");
  const newcomerLastNameWritePermission = permissionLabel("Newcomers", "Write", "Last Name");
  const newcomerPhoneWritePermission = permissionLabel("Newcomers", "Write", "Phone");
  const newcomerEmailWritePermission = permissionLabel("Newcomers", "Write", "Email");
  const newcomerFamilySizeWritePermission = permissionLabel("Newcomers", "Write", "Family Size");
  const newcomerLanguagesWritePermission = permissionLabel("Newcomers", "Write", "Languages");
  const canSearchSponsors = Boolean(permissions.modules.members?.read);
  const canSearchNewcomers = Boolean(permissions.modules.newcomers?.read);
  const newcomerFieldAccess = useMemo(
    () => ({
      first_name: permissions.canWriteField("newcomers", "first_name"),
      last_name: permissions.canWriteField("newcomers", "last_name"),
      contact_phone: permissions.canWriteField("newcomers", "contact_phone"),
      contact_email: permissions.canWriteField("newcomers", "contact_email"),
      family_size: permissions.canWriteField("newcomers", "family_size"),
      preferred_language: permissions.canWriteField("newcomers", "preferred_language"),
      interpreter_required: permissions.canWriteField("newcomers", "interpreter_required"),
    }),
    [permissions]
  );
  const canQuickCreateNewcomer =
    Boolean(permissions.modules.newcomers?.write) &&
    newcomerFieldAccess.first_name &&
    newcomerFieldAccess.last_name &&
    (newcomerFieldAccess.contact_phone || newcomerFieldAccess.contact_email);
  const newcomerQuickCreatePermissionNeeds = useMemo(() => {
    const missingPermissions: string[] = [];
    if (!permissions.modules.newcomers?.write) {
      missingPermissions.push(newcomersWritePermission);
    }
    if (!newcomerFieldAccess.first_name) {
      missingPermissions.push(newcomerFirstNameWritePermission);
    }
    if (!newcomerFieldAccess.last_name) {
      missingPermissions.push(newcomerLastNameWritePermission);
    }
    if (!newcomerFieldAccess.contact_phone && !newcomerFieldAccess.contact_email) {
      missingPermissions.push(`${newcomerPhoneWritePermission} or ${newcomerEmailWritePermission}`);
    }
    return missingPermissions;
  }, [
    newcomerEmailWritePermission,
    newcomerFieldAccess,
    newcomerFirstNameWritePermission,
    newcomerLastNameWritePermission,
    newcomerPhoneWritePermission,
    newcomersWritePermission,
    permissions.modules.newcomers?.write,
  ]);
  const newcomerQuickCreateHint = useMemo(() => {
    if (newcomerQuickCreatePermissionNeeds.length === 0) {
      return "";
    }
    return permissionMessage("create a newcomer from this sponsorship", newcomerQuickCreatePermissionNeeds);
  }, [newcomerQuickCreatePermissionNeeds, permissionMessage]);
  const beneficiaryPermissionNeeds = useMemo(() => {
    const missingPermissions = new Set<string>();
    if (!canSearchNewcomers) {
      missingPermissions.add(newcomersReadPermission);
    }
    if (!canQuickCreateNewcomer) {
      newcomerQuickCreatePermissionNeeds.forEach((permissionName) => missingPermissions.add(permissionName));
    }
    return [...missingPermissions];
  }, [
    canQuickCreateNewcomer,
    canSearchNewcomers,
    newcomerQuickCreatePermissionNeeds,
    newcomersReadPermission,
  ]);
  const sponsorSearchPermissionHint = permissionMessage("search co-sponsors", [membersReadPermission]);
  const beneficiaryOptionsPermissionHint = permissionMessage(
    "use some immigrant options in this step",
    beneficiaryPermissionNeeds
  );
  const existingNewcomerPermissionHint = permissionMessage("link an existing newcomer", [newcomersReadPermission]);
  const familySizePermissionHint = permissionMessage("edit family size", [newcomerFamilySizeWritePermission]);
  const preferredLanguagePermissionHint = permissionMessage(
    "edit preferred language",
    [newcomerLanguagesWritePermission]
  );

  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState<"cases" | "prescreen" | "budget">(
    viewParam === "budget" ? "budget" : viewParam === "prescreen" ? "prescreen" : "cases",
  );

  const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
  const [sponsorships, setSponsorships] = useState<SponsorshipListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [prescreening, setPrescreening] = useState<SponsorshipPrescreeningResponse | null>(null);
  const [prescreenLoading, setPrescreenLoading] = useState(false);
  const [prescreenRefreshTick, setPrescreenRefreshTick] = useState(0);
  const [listRefreshTick, setListRefreshTick] = useState(0);
  const [metricsRefreshTick, setMetricsRefreshTick] = useState(0);
  const [expandedPrescreenMemberId, setExpandedPrescreenMemberId] = useState<number | null>(null);
  const [selectedPrescreenMemberIds, setSelectedPrescreenMemberIds] = useState<Set<number>>(new Set());
  const [prescreenFilters, setPrescreenFilters] = useState({
    q: "",
    eligibility: "",
    volunteer: "",
    page: 1,
  });
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
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<number>>(new Set());
  const [exportingFormat, setExportingFormat] = useState<"csv" | "xlsx" | null>(null);
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
  const [budgetTargetCase, setBudgetTargetCase] = useState<Sponsorship | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetRefreshTick, setBudgetRefreshTick] = useState(0);
  const [budgetEdits, setBudgetEdits] = useState<Record<number, BudgetDraft>>({});
  const [budgetSavingId, setBudgetSavingId] = useState<number | null>(null);
  const [roundYear, setRoundYear] = useState(String(today.getFullYear()));
  const [budgetRounds, setBudgetRounds] = useState<SponsorshipBudgetRound[]>([]);
  const [roundsLoading, setRoundsLoading] = useState(false);
  const [roundsError, setRoundsError] = useState<string | null>(null);
  const [roundRefreshTick, setRoundRefreshTick] = useState(0);
  const [roundEdits, setRoundEdits] = useState<Record<number, BudgetRoundDraft>>({});
  const [newRoundDraft, setNewRoundDraft] = useState<BudgetRoundDraft>({
    round_number: "",
    start_date: "",
    end_date: "",
    slot_budget: "",
  });
  const [roundSavingId, setRoundSavingId] = useState<number | "new" | null>(null);
  const [roundDeletingId, setRoundDeletingId] = useState<number | null>(null);

  const [newcomerForm, setNewcomerForm] = useState<NewcomerQuickForm>(emptyNewcomerForm);
  const [newcomerFieldErrors, setNewcomerFieldErrors] = useState<NewcomerQuickErrors>({});
  const newcomerPhoneSnapSuggestion = useMemo(() => {
    const value = newcomerForm.contact_phone.trim();
    if (!value || getCanonicalCanadianPhone(value)) {
      return null;
    }
    return getCanadianPhoneSnapSuggestion(value);
  }, [newcomerForm.contact_phone]);

  const [statusModal, setStatusModal] = useState<StatusModalState>({
    open: false,
    sponsorship: null,
    nextStatus: null,
    title: "",
    reasonRequired: false,
  });
  const [statusReason, setStatusReason] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const listRequestRef = useRef(0);
  const debouncedQuery = useDebouncedValue(filters.q, 350);
  const debouncedPrescreenQuery = useDebouncedValue(prescreenFilters.q, 350);
  const debouncedSponsorSearch = useDebouncedValue(sponsorSearch.trim(), 300);

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
    const nextView = viewParam === "budget" ? "budget" : viewParam === "prescreen" ? "prescreen" : "cases";
    if (nextView !== activeView) {
      setActiveView(nextView);
    }
  }, [viewParam, activeView]);

  useEffect(() => {
    const budgetCaseParam = searchParams.get("budget_case");
    if (!budgetCaseParam || activeView !== "budget") return;
    const budgetCaseId = Number(budgetCaseParam);
    if (!Number.isFinite(budgetCaseId) || budgetCaseId < 1) {
      updateSearchParams({ budget_case: null });
      return;
    }
    if (budgetTargetCase?.id === budgetCaseId) return;
    let active = true;
    getSponsorship(budgetCaseId)
      .then((record) => {
        if (!active) return;
        setBudgetTargetCase(record);
        setBudgetEdits((prev) => ({
          ...prev,
          [record.id]: {
            budget_round_id: String(record.budget_round_id ?? ""),
            budget_slots: String(record.budget_slots || 1),
          },
        }));
        setBudgetRefreshTick((prev) => prev + 1);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        toast.push(parseApiErrorMessage(error, "Unable to open budget allocation."), "error");
        updateSearchParams({ budget_case: null });
      });
    return () => {
      active = false;
    };
  }, [activeView, budgetTargetCase?.id, searchParams, toast, updateSearchParams]);

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
    () => budgetTargetCase
      ? {
          page: 1,
          page_size: 1,
          ids: String(budgetTargetCase.id),
        }
      : {
          page: 1,
          page_size: 100,
          budget_month: budgetMonth ? Number(budgetMonth) : undefined,
          budget_year: budgetYear ? Number(budgetYear) : undefined,
        },
    [budgetMonth, budgetTargetCase, budgetYear]
  );

  const budgetCacheKey = useMemo(
    () => `sponsorships:budget:${JSON.stringify(budgetListPayload)}`,
    [budgetListPayload]
  );

  const prescreenPayload = useMemo(
    () => ({
      page: prescreenFilters.page,
      page_size: PAGE_SIZE,
      q: debouncedPrescreenQuery || undefined,
      eligibility: (prescreenFilters.eligibility || undefined) as SponsorshipPrescreeningItem["eligibility"] | undefined,
      volunteer:
        prescreenFilters.volunteer === "" ? undefined : prescreenFilters.volunteer === "true",
    }),
    [debouncedPrescreenQuery, prescreenFilters.eligibility, prescreenFilters.page, prescreenFilters.volunteer],
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
  }, [listPayload, listCacheKey, canView, toast, listRefreshTick]);

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
    if (!canView || activeView !== "prescreen") return;
    let active = true;
    setPrescreenLoading(true);
    listSponsorshipPrescreening(prescreenPayload)
      .then((response) => {
        if (active) setPrescreening(response);
      })
      .catch((error) => {
        console.error(error);
        if (active) toast.push("Unable to load sponsorship pre-screening.");
      })
      .finally(() => {
        if (active) setPrescreenLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeView, canView, prescreenPayload, prescreenRefreshTick, toast]);

  useEffect(() => {
    setSelectedPrescreenMemberIds(new Set());
  }, [debouncedPrescreenQuery, prescreenFilters.eligibility, prescreenFilters.volunteer]);

  useEffect(() => {
    setBudgetEdits({});
  }, [budgetMonth, budgetYear]);

  useEffect(() => {
    if (!canView || (!wizardOpen && activeView !== "budget")) return;
    let active = true;
    setRoundsLoading(true);
    setRoundsError(null);
    listSponsorshipBudgetRounds(roundYear ? Number(roundYear) : undefined)
      .then((rounds) => {
        if (!active) return;
        setBudgetRounds(rounds);
      })
      .catch((error) => {
        if (!active) return;
        console.error(error);
        setRoundsError("Unable to load slot budgets.");
      })
      .finally(() => {
        if (active) {
          setRoundsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [roundYear, roundRefreshTick, activeView, canView, wizardOpen]);

  useEffect(() => {
    setRoundEdits({});
    setNewRoundDraft({
      round_number: "",
      start_date: "",
      end_date: "",
      slot_budget: "",
    });
  }, [roundYear]);

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
  }, [canView, toast, metricsRefreshTick]);

  useEffect(() => {
    setSelectedCaseIds(new Set());
  }, [
    filters.status,
    filters.beneficiary_type,
    filters.sponsor_id,
    filters.county,
    filters.assigned_staff_id,
    filters.created_from,
    filters.created_to,
    debouncedQuery,
  ]);

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
  }, [canSearchSponsors, sponsorSearch]);

  useEffect(() => {
    if (!canSearchSponsors) {
      setSponsorSearchLoading(false);
      setSponsorResults([]);
      setSponsorSearchError(null);
      return;
    }
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
  }, [canSearchSponsors, debouncedSponsorSearch]);

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
        if (record.budget_round?.year) {
          setRoundYear(String(record.budget_round.year));
        }
        setWizardError(null);
        setNewcomerFieldErrors({});
        setDraftEditingId(record.id);
        setSponsorSearch(`${record.sponsor.first_name} ${record.sponsor.last_name}`.trim());
        setSponsorResults([]);
        setSponsorContextAvailable(true);


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
            setWizardError("Co-sponsor must be Active before creating a case.");
          }
        } catch (error) {
          if (!active) return;
          if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
            setSponsorContextAvailable(false);
            return;
          }
          console.error(error);
          toast.push("Unable to load co-sponsor context.");
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
    const totals = { slots: 0, used: 0 };
    items.forEach((item) => {
      totals.slots += item.budget_slots ?? 0;
      totals.used += item.used_slots ?? 0;
    });
    const utilization = totals.slots > 0 ? Math.round((totals.used / totals.slots) * 1000) / 10 : 0;
    return { ...totals, utilization };
  }, [budgetCases]);

  const budgetRoundTotals = useMemo(() => {
    const totalSlots = budgetRounds.reduce((sum, round) => sum + (round.slot_budget || 0), 0);
    const usedSlots = budgetRounds.reduce((sum, round) => sum + (round.used_slots || 0), 0);
    const utilization = totalSlots > 0 ? Math.round((usedSlots / totalSlots) * 1000) / 10 : 0;
    return { slots: totalSlots, used: usedSlots, utilization, rounds: budgetRounds.length };
  }, [budgetRounds]);

  const budgetRoundLookup = useMemo(
    () => new Map(budgetRounds.map((round) => [String(round.id), round])),
    [budgetRounds],
  );
  const selectedWizardRound = useMemo(() => {
    if (!wizardForm.budget_round_id) return null;
    return budgetRoundLookup.get(wizardForm.budget_round_id) ?? null;
  }, [budgetRoundLookup, wizardForm.budget_round_id]);
  const sponsorshipConsumesBudget = useCallback(
    (status: Sponsorship["status"]) => BUDGET_CONSUMING_STATUSES.has(status),
    []
  );
  const getAvailableSlotsForRound = useCallback(
    (round: SponsorshipBudgetRound, sponsorship?: Sponsorship) => {
      const currentUsage =
        sponsorship &&
        sponsorshipConsumesBudget(sponsorship.status) &&
        sponsorship.budget_round_id === round.id
          ? sponsorship.used_slots || 0
          : 0;
      return Math.max((round.slot_budget || 0) - (round.used_slots || 0) + currentUsage, 0);
    },
    [sponsorshipConsumesBudget]
  );
  const selectedWizardRoundRemainingSlots = useMemo(() => {
    if (!selectedWizardRound) return null;
    return Math.max((selectedWizardRound.slot_budget || 0) - (selectedWizardRound.used_slots || 0), 0);
  }, [selectedWizardRound]);
  const availableBudgetRounds = useMemo(
    () => budgetRounds.filter((round) => (round.used_slots || 0) < (round.slot_budget || 0)),
    [budgetRounds]
  );
  const allBudgetRoundsFull = useMemo(
    () => budgetRounds.length > 0 && availableBudgetRounds.length === 0,
    [availableBudgetRounds.length, budgetRounds.length]
  );

  useEffect(() => {
    if (!wizardForm.budget_round_id) return;
    if (roundsLoading) return;
    if (!budgetRoundLookup.has(wizardForm.budget_round_id)) {
      setWizardForm((prev) => ({ ...prev, budget_round_id: "" }));
    }
  }, [budgetRoundLookup, wizardForm.budget_round_id, roundsLoading]);

  const nextRoundNumber = useMemo(() => {
    const used = new Set(budgetRounds.map((round) => round.round_number));
    for (let index = 0; index < ROUND_OPTIONS.length; index += 1) {
      const roundNumber = Number(ROUND_OPTIONS[index]);
      if (!used.has(roundNumber)) {
        return String(roundNumber);
      }
    }
    return "";
  }, [budgetRounds]);

  useEffect(() => {
    if (newRoundDraft.round_number) return;
    if (nextRoundNumber) {
      setNewRoundDraft((prev) => ({ ...prev, round_number: nextRoundNumber }));
    }
  }, [nextRoundNumber, newRoundDraft.round_number]);

  if (!canView) {
    return <Navigate to="/dashboard" replace />;
  }

  const totalPages = sponsorships ? Math.ceil(sponsorships.total / PAGE_SIZE) : 1;
  const prescreenTotalPages = prescreening ? Math.max(1, Math.ceil(prescreening.total / PAGE_SIZE)) : 1;
  const visibleCaseItems = sponsorships?.items ?? [];
  const visiblePrescreenItems = prescreening?.items ?? [];
  const selectedCaseArray = Array.from(selectedCaseIds).sort((a, b) => a - b);
  const selectedPrescreenArray = Array.from(selectedPrescreenMemberIds).sort((a, b) => a - b);
  const selectedVisibleCount = visibleCaseItems.filter((item) => selectedCaseIds.has(item.id)).length;
  const allVisibleSelected = visibleCaseItems.length > 0 && selectedVisibleCount === visibleCaseItems.length;
  const anyCaseSelected = selectedCaseArray.length > 0;
  const selectedVisiblePrescreenCount = visiblePrescreenItems.filter((item) =>
    selectedPrescreenMemberIds.has(item.member_id),
  ).length;
  const allVisiblePrescreenSelected =
    visiblePrescreenItems.length > 0 && selectedVisiblePrescreenCount === visiblePrescreenItems.length;
  const anyPrescreenSelected = selectedPrescreenArray.length > 0;
  const activeFilters = [
    filters.status && `Status: ${filters.status}`,
    filters.beneficiary_type && `Immigrant: ${filters.beneficiary_type}`,
    filters.sponsor_id && `Co-sponsor ID: ${filters.sponsor_id}`,
    filters.county && `County: ${filters.county}`,
    filters.assigned_staff_id && `Assigned ID: ${filters.assigned_staff_id}`,
    filters.created_from && `From ${filters.created_from}`,
    filters.created_to && `To ${filters.created_to}`,
  ].filter(Boolean);

  const handleRefresh = () => {
    clearCachePrefix("sponsorships:");
    setListRefreshTick((prev) => prev + 1);
    setMetricsRefreshTick((prev) => prev + 1);
    if (activeView === "budget") {
      setBudgetRefreshTick((prev) => prev + 1);
      setRoundRefreshTick((prev) => prev + 1);
    } else if (activeView === "prescreen") {
      setPrescreenRefreshTick((prev) => prev + 1);
    }
  };

  const handleViewChange = (view: "cases" | "prescreen" | "budget") => {
    setActiveView(view);
    updateSearchParams({ view: view === "cases" ? null : view });
  };

  useEffect(() => {
    const stepId = tour.currentStep?.id;
    if (!tour.active || !stepId || !stepId.startsWith("sponsorship")) return;
    if (activeView !== "cases") {
      handleViewChange("cases");
    }
  }, [activeView, tour.active, tour.currentStep?.id]);

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
    setNewcomerForm(emptyNewcomerForm());
    setNewcomerFieldErrors({});
  };

  const handleStartFromPrescreen = async (item: SponsorshipPrescreeningItem) => {
    handleWizardOpen();
    setWizardForm((prev) => ({
      ...prev,
      sponsor_member_id: item.member_id,
      sponsor_name: item.member_name,
    }));
    setSponsorSearch(item.member_name);
    try {
      const context = await getSponsorContext(item.member_id);
      setSponsorContext(context);
    } catch (error) {
      console.error(error);
      setSponsorContext({
        member_id: item.member_id,
        member_name: item.member_name,
        member_status: item.member_status,
        member_phone: item.member_phone,
        member_email: item.member_email,
        marital_status: null,
        spouse_name: null,
        spouse_phone: null,
        spouse_email: null,
        last_sponsorship_id: item.last_sponsorship_id,
        last_sponsorship_date: item.last_sponsorship_date,
        last_sponsorship_name: item.last_beneficiary_name,
        last_sponsorship_status: item.last_sponsorship_status,
        history_count_last_12_months: 0,
        volunteer_services: item.volunteer_service_types,
        father_of_repentance_id: null,
        father_of_repentance_name: null,
        budget_usage: null,
        payment_history_start: null,
        payment_history_end: null,
        payment_history: [],
      });
    }
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    setDraftEditingId(null);
    updateSearchParams({ draft: null });
  };

  const handleToggleCaseSelection = (caseId: number) => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const handleToggleSelectAllVisible = () => {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleCaseItems.forEach((item) => next.delete(item.id));
      } else {
        visibleCaseItems.forEach((item) => next.add(item.id));
      }
      return next;
    });
  };

  const handleTogglePrescreenSelection = (memberId: number) => {
    setSelectedPrescreenMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  };

  const handleToggleSelectAllVisiblePrescreen = () => {
    setSelectedPrescreenMemberIds((prev) => {
      const next = new Set(prev);
      if (allVisiblePrescreenSelected) {
        visiblePrescreenItems.forEach((item) => next.delete(item.member_id));
      } else {
        visiblePrescreenItems.forEach((item) => next.add(item.member_id));
      }
      return next;
    });
  };

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleCaseExport = async (format: "csv" | "xlsx") => {
    if (exportingFormat) return;
    setExportingFormat(format);
    const params = {
      status: filters.status || undefined,
      beneficiary_type: filters.beneficiary_type || undefined,
      sponsor_id: filters.sponsor_id ? Number(filters.sponsor_id) : undefined,
      county: filters.county || undefined,
      assigned_staff_id: filters.assigned_staff_id ? Number(filters.assigned_staff_id) : undefined,
      created_from: filters.created_from || undefined,
      created_to: filters.created_to || undefined,
      q: debouncedQuery || undefined,
      ids: anyCaseSelected ? selectedCaseArray.join(",") : undefined,
    };
    const scope = anyCaseSelected ? "selected" : "filtered";
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `sponsorships-${scope}-${stamp}.${format}`;
    try {
      const blob =
        format === "csv"
          ? await exportSponsorshipsCsv(params)
          : await exportSponsorshipsExcel(params);
      triggerBlobDownload(blob, filename);
      toast.push(
        anyCaseSelected
          ? `${selectedCaseArray.length} selected case${selectedCaseArray.length === 1 ? "" : "s"} exported (${format.toUpperCase()}).`
          : `Filtered cases exported (${format.toUpperCase()}).`,
      );
    } catch (error) {
      console.error(error);
      toast.push(`Unable to export sponsorship cases as ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat(null);
    }
  };

  const handlePrescreenExport = async () => {
    if (exportingFormat) return;
    setExportingFormat("xlsx");
    const scope = anyPrescreenSelected ? "selected" : "filtered";
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      const blob = await exportSponsorshipPrescreeningExcel({
        q: debouncedPrescreenQuery || undefined,
        eligibility: (prescreenFilters.eligibility || undefined) as SponsorshipPrescreeningItem["eligibility"] | undefined,
        volunteer: prescreenFilters.volunteer === "" ? undefined : prescreenFilters.volunteer === "true",
        ids: anyPrescreenSelected ? selectedPrescreenArray.join(",") : undefined,
      });
      triggerBlobDownload(blob, `sponsorship-pre-screening-${scope}-${stamp}.xlsx`);
      toast.push(
        anyPrescreenSelected
          ? `${selectedPrescreenArray.length} selected member${selectedPrescreenArray.length === 1 ? "" : "s"} exported (Excel).`
          : "Filtered pre-screening roster exported (Excel).",
      );
    } catch (error) {
      console.error(error);
      toast.push("Unable to export sponsorship pre-screening as Excel.");
    } finally {
      setExportingFormat(null);
    }
  };

  const getBudgetDraft = useCallback(
    (item: Sponsorship): BudgetDraft => {
      return (
        budgetEdits[item.id] ?? {
          budget_slots: item.budget_slots ? String(item.budget_slots) : "",
          budget_round_id: item.budget_round_id ? String(item.budget_round_id) : "",
        }
      );
    },
    [budgetEdits],
  );

  const handleBudgetFieldChange = (id: number, field: keyof BudgetDraft, value: string) => {
    setBudgetEdits((prev) => {
      const current = prev[id] ?? { budget_slots: "", budget_round_id: "" };
      return { ...prev, [id]: { ...current, [field]: value } };
    });
  };

  const handleBudgetSave = async (item: Sponsorship) => {
    const draft = getBudgetDraft(item);
    const nextSlots = draft.budget_slots.trim();
    const nextRound = draft.budget_round_id.trim();
    const nextRoundId = nextRound ? Number(nextRound) : null;
    const itemConsumesBudget = sponsorshipConsumesBudget(item.status);
    const selectedRound =
      nextRoundId && Number.isFinite(nextRoundId) && nextRoundId > 0
        ? budgetRounds.find((round) => round.id === nextRoundId) ?? null
        : null;
    const resolvedBudgetSlots: number | undefined = nextSlots
      ? Number(nextSlots)
      : item.budget_slots || (selectedRound ? 1 : undefined);
    const payload: Partial<SponsorshipPayload> = {};

    if (nextSlots) {
      if (!Number.isFinite(resolvedBudgetSlots) || (resolvedBudgetSlots ?? 0) < 1) {
        toast.push("Budget slots must be a positive number.");
        return;
      }
      payload.budget_slots = resolvedBudgetSlots;
    }
    if (nextRound !== String(item.budget_round_id ?? "")) {
      if (nextRound) {
        if (!Number.isFinite(nextRoundId) || (nextRoundId ?? 0) < 1) {
          toast.push("Select a valid budget round.");
          return;
        }
        payload.budget_round_id = nextRoundId;
      } else {
        payload.budget_round_id = null;
      }
    }
    if (itemConsumesBudget && !selectedRound && payload.budget_round_id === null) {
      toast.push("This sponsorship must stay assigned to a budget round while it is submitted or active.");
      return;
    }
    if (selectedRound && resolvedBudgetSlots) {
      const availableSlots = getAvailableSlotsForRound(selectedRound, item);
      if (resolvedBudgetSlots > availableSlots) {
        toast.push(
          `Round ${selectedRound.round_number} (${selectedRound.year}) only has ${availableSlots} remaining slot${
            availableSlots === 1 ? "" : "s"
          }. Create the next round before increasing this case further.`
        );
        return;
      }
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
      toast.push(parseApiErrorMessage(error, "Unable to update budget."), "error");
    } finally {
      setBudgetSavingId(null);
    }
  };

  const getRoundDraft = useCallback(
    (round: SponsorshipBudgetRound): BudgetRoundDraft => {
      return (
        roundEdits[round.id] ?? {
          round_number: String(round.round_number),
          start_date: round.start_date ?? "",
          end_date: round.end_date ?? "",
          slot_budget: String(round.slot_budget ?? ""),
        }
      );
    },
    [roundEdits],
  );

  const handleRoundFieldChange = (round: SponsorshipBudgetRound, field: keyof BudgetRoundDraft, value: string) => {
    setRoundEdits((prev) => {
      const current =
        prev[round.id] ?? {
          round_number: String(round.round_number),
          start_date: round.start_date ?? "",
          end_date: round.end_date ?? "",
          slot_budget: String(round.slot_budget ?? ""),
        };
      return { ...prev, [round.id]: { ...current, [field]: value } };
    });
  };

  const validateRoundDraft = (draft: BudgetRoundDraft, existingRounds: SponsorshipBudgetRound[], editingId?: number) => {
    const roundNumber = Number(draft.round_number);
    if (!draft.round_number || !Number.isFinite(roundNumber) || roundNumber < 1) {
      return "Select a valid round number.";
    }
    const slotBudget = Number(draft.slot_budget);
    if (!draft.slot_budget || !Number.isFinite(slotBudget) || slotBudget < 1) {
      return "Slot budget must be a positive number.";
    }
    if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
      return "End date must be on or after the start date.";
    }
    const duplicate = existingRounds.some(
      (round) => round.round_number === roundNumber && round.id !== editingId,
    );
    if (duplicate) {
      return "This round number is already configured for the year.";
    }
    return null;
  };

  const handleRoundSave = async (round: SponsorshipBudgetRound) => {
    if (!canManageBudgetRounds) return;
    const draft = getRoundDraft(round);
    const errorMessage = validateRoundDraft(draft, budgetRounds, round.id);
    if (errorMessage) {
      toast.push(errorMessage);
      return;
    }
    setRoundSavingId(round.id);
    try {
      const updated = await updateSponsorshipBudgetRound(round.id, {
        year: Number(roundYear),
        round_number: Number(draft.round_number),
        start_date: draft.start_date || null,
        end_date: draft.end_date || null,
        slot_budget: Number(draft.slot_budget),
      });
      setBudgetRounds((prev) =>
        prev
          .map((entry) => (entry.id === updated.id ? updated : entry))
          .sort((a, b) => a.round_number - b.round_number),
      );
      setRoundEdits((prev) => {
        const next = { ...prev };
        delete next[round.id];
        return next;
      });
      toast.push("Round updated.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to update round.");
    } finally {
      setRoundSavingId(null);
    }
  };

  const handleRoundCreate = async () => {
    if (!canManageBudgetRounds) return;
    const errorMessage = validateRoundDraft(newRoundDraft, budgetRounds);
    if (errorMessage) {
      toast.push(errorMessage);
      return;
    }
    setRoundSavingId("new");
    try {
      const created = await createSponsorshipBudgetRound({
        year: Number(roundYear),
        round_number: Number(newRoundDraft.round_number),
        start_date: newRoundDraft.start_date || null,
        end_date: newRoundDraft.end_date || null,
        slot_budget: Number(newRoundDraft.slot_budget),
      });
      setBudgetRounds((prev) =>
        [...prev, created].sort((a, b) => a.round_number - b.round_number),
      );
      setNewRoundDraft({
        round_number: "",
        start_date: "",
        end_date: "",
        slot_budget: "",
      });
      toast.push("Round added.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to add round.");
    } finally {
      setRoundSavingId(null);
    }
  };

  const handleRoundDelete = async (round: SponsorshipBudgetRound) => {
    if (!canManageBudgetRounds) return;
    const confirmed = window.confirm(`Remove Round ${round.round_number} for ${round.year}?`);
    if (!confirmed) return;
    setRoundDeletingId(round.id);
    try {
      await deleteSponsorshipBudgetRound(round.id);
      setBudgetRounds((prev) => prev.filter((entry) => entry.id !== round.id));
      setRoundEdits((prev) => {
        const next = { ...prev };
        delete next[round.id];
        return next;
      });
      toast.push("Round removed.");
    } catch (error) {
      console.error(error);
      toast.push("Unable to remove round.");
    } finally {
      setRoundDeletingId(null);
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
        setWizardError("Co-sponsor must be Active before creating a case.");
      } else {
        setWizardError(null);
      }
      return;
    }
    try {
      const context = await getSponsorContext(member.id);
      setSponsorContext(context);
      if (context.member_status && context.member_status !== "Active") {
        setWizardError("Co-sponsor must be Active before creating a case.");
      } else {
        setWizardError(null);
      }
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        setSponsorContextAvailable(false);
        const fallback = buildSponsorContextFallback(member);
        setSponsorContext(fallback);
        if (fallback.member_status !== "Active") {
          setWizardError("Co-sponsor must be Active before creating a case.");
        } else {
          setWizardError(null);
        }
        return;
      }
      console.error(error);
      setWizardError("Unable to load co-sponsor context.");
    }
  };

  const sponsorBlocked = !sponsorContext || sponsorContext.member_status !== "Active";
  const paymentHistory = useMemo(() => {
    if (!sponsorContext?.payment_history) return [];
    return [...sponsorContext.payment_history].sort(
      (a, b) => b.paid_at.localeCompare(a.paid_at) || b.id - a.id,
    );
  }, [sponsorContext?.payment_history]);
  const paymentHistoryAvailable = Boolean(
    sponsorContext?.payment_history_start && sponsorContext?.payment_history_end,
  );
  const paymentHistoryRangeLabel = useMemo(() => {
    if (!paymentHistoryAvailable) return null;
    const startLabel = formatDate(sponsorContext?.payment_history_start);
    const endLabel = formatDate(sponsorContext?.payment_history_end);
    if (startLabel !== "—" && endLabel !== "—") {
      return `${startLabel} – ${endLabel}`;
    }
    return "Last 36 months";
  }, [paymentHistoryAvailable, sponsorContext?.payment_history_end, sponsorContext?.payment_history_start]);
  const paymentContinuity = useMemo(() => {
    if (!paymentHistoryAvailable) return null;
    return buildPaymentContinuity(paymentHistory, {
      startDate: sponsorContext?.payment_history_start,
      endDate: sponsorContext?.payment_history_end,
      months: 36,
    });
  }, [paymentHistory, paymentHistoryAvailable, sponsorContext?.payment_history_end, sponsorContext?.payment_history_start]);

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
    if (!canQuickCreateNewcomer) {
      setWizardError(newcomerQuickCreateHint || permissionMessage("create a newcomer from this sponsorship", [newcomersWritePermission]));
      return;
    }

    const fieldErrors: NewcomerQuickErrors = {};
    const firstName = newcomerForm.first_name.trim();
    const lastName = newcomerForm.last_name.trim();
    const emailInput = newcomerForm.contact_email.trim();
    const normalizedEmail = emailInput ? normalizeEmailInput(emailInput) : "";
    const phoneInput = newcomerForm.contact_phone.trim();
    const canonicalPhone = phoneInput ? getCanonicalCanadianPhone(phoneInput) : null;
    const phoneValidationMessage = phoneInput ? getCanadianPhoneValidationMessage(phoneInput, "Phone") : null;
    const postalCodeInput = newcomerForm.temporary_address_postal_code.trim();
    const formattedPostalCode = formatCanadianPostalCode(postalCodeInput);
    const postalCodeValidationMessage = postalCodeInput
      ? getCanadianPostalCodeValidationMessage(postalCodeInput)
      : null;

    if (newcomerFieldAccess.first_name && !firstName) {
      fieldErrors.first_name = "First name is required.";
    }
    if (newcomerFieldAccess.last_name && !lastName) {
      fieldErrors.last_name = "Last name is required.";
    }
    if (newcomerFieldAccess.contact_email && emailInput && !hasValidEmail(normalizedEmail)) {
      fieldErrors.contact_email = "Enter a valid email address.";
    }
    if (newcomerFieldAccess.contact_phone && phoneInput && !canonicalPhone) {
      fieldErrors.contact_phone =
        phoneValidationMessage || "Enter a valid Canadian phone number in +1########## format.";
    }
    if (newcomerFieldAccess.family_size && newcomerForm.family_size) {
      const size = Number(newcomerForm.family_size);
      if (!Number.isInteger(size) || size < 1 || size > 20) {
        fieldErrors.family_size = "Family size must be between 1 and 20.";
      }
    }
    if (postalCodeValidationMessage) {
      fieldErrors.temporary_address_postal_code = postalCodeValidationMessage;
    }

    const missingContact = newcomerFieldAccess.contact_phone && newcomerFieldAccess.contact_email
      ? !phoneInput && !emailInput
      : newcomerFieldAccess.contact_phone
        ? !phoneInput
        : newcomerFieldAccess.contact_email
          ? !emailInput
          : false;
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    if (missingContact || hasFieldErrors) {
      setNewcomerFieldErrors(fieldErrors);
      if (missingContact) {
        setWizardError(
          newcomerFieldAccess.contact_phone && newcomerFieldAccess.contact_email
            ? "Provide a phone or email for the newcomer."
            : newcomerFieldAccess.contact_phone
              ? "Provide a phone number for the newcomer."
              : "Provide an email address for the newcomer."
        );
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
        ...(newcomerFieldAccess.family_size && newcomerForm.family_size
          ? { family_size: Number(newcomerForm.family_size) }
          : {}),
        ...(newcomerFieldAccess.contact_phone && (canonicalPhone || phoneInput)
          ? { contact_phone: canonicalPhone || phoneInput }
          : {}),
        ...(newcomerFieldAccess.contact_email && normalizedEmail
          ? { contact_email: normalizedEmail }
          : {}),
        ...(newcomerFieldAccess.preferred_language && newcomerForm.preferred_language
          ? { preferred_language: newcomerForm.preferred_language }
          : {}),
        ...(newcomerFieldAccess.interpreter_required
          ? { interpreter_required: newcomerForm.interpreter_required }
          : {}),
        ...(newcomerForm.country ? { country: newcomerForm.country } : {}),
        ...(newcomerForm.county ? { county: newcomerForm.county } : {}),
        ...(newcomerForm.temporary_address_street ? { temporary_address_street: newcomerForm.temporary_address_street } : {}),
        ...(newcomerForm.temporary_address_city ? { temporary_address_city: newcomerForm.temporary_address_city } : {}),
        ...(newcomerForm.temporary_address_province ? { temporary_address_province: newcomerForm.temporary_address_province } : {}),
        ...(formattedPostalCode ? { temporary_address_postal_code: formattedPostalCode } : {}),
        arrival_date: new Date().toISOString().slice(0, 10),
      });
      const beneficiaryName = `${newcomer.first_name} ${newcomer.last_name}`.trim();
      const manualName = splitManualBeneficiaryName(beneficiaryName);
      setWizardForm((prev) => ({
        ...prev,
        newcomer_id: null,
        beneficiary_member_id: null,
        beneficiary_name: beneficiaryName,
        beneficiary_first_name: manualName.firstName,
        beneficiary_last_name: manualName.lastName,
        beneficiary_mode: "external",
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
      setWizardError("Select a co-sponsor to continue.");
      return;
    }
    if (!wizardForm.beneficiary_mode) {
      setWizardError("Select an immigrant to continue.");
      return;
    }
    const beneficiaryName =
      wizardForm.beneficiary_mode === "external"
        ? `${wizardForm.beneficiary_first_name.trim()} ${wizardForm.beneficiary_last_name.trim()}`.trim()
        : wizardForm.beneficiary_name.trim();
    if (wizardForm.beneficiary_mode === "external" && !wizardForm.beneficiary_first_name.trim()) {
      setWizardError("Provide the immigrant first name.");
      return;
    }
    if (wizardForm.beneficiary_mode === "external" && !wizardForm.beneficiary_last_name.trim()) {
      setWizardError("Provide the immigrant last name.");
      return;
    }
    if (!beneficiaryName) {
      setWizardError("Provide an immigrant name.");
      return;
    }
    if (!wizardForm.start_date) {
      setWizardError("Provide the sponsorship start date.");
      return;
    }
    if (!wizardForm.monthly_amount.trim()) {
      setWizardError("Provide a pledge amount.");
      return;
    }
    if (wizardForm.last_status === "Rejected" && !wizardForm.last_status_reason.trim()) {
      setWizardError("Provide a reason when the last sponsorship was rejected.");
      return;
    }
    const resolvedBudgetSlots = wizardForm.budget_round_id ? Number(wizardForm.budget_slots || "1") : undefined;
    if (status !== "Draft") {
      if (!wizardForm.budget_round_id) {
        setWizardError(
          "This sponsorship cannot be submitted until a budget round with available slots is selected. Ask an admin to create a new round if the current ones are full."
        );
        return;
      }
      if (!selectedWizardRound) {
        setWizardError("Select a valid budget round before submitting this sponsorship.");
        return;
      }
      if (!resolvedBudgetSlots || !Number.isFinite(resolvedBudgetSlots) || resolvedBudgetSlots < 1) {
        setWizardError("Select a valid number of budget slots before submitting this sponsorship.");
        return;
      }
      const remainingSlots = selectedWizardRoundRemainingSlots ?? 0;
      if (resolvedBudgetSlots > remainingSlots) {
        setWizardError(
          `Round ${selectedWizardRound.round_number} (${selectedWizardRound.year}) only has ${remainingSlots} remaining slot${
            remainingSlots === 1 ? "" : "s"
          }. Ask an admin to create the next round or choose another round with enough capacity.`
        );
        return;
      }
    }
    setWizardLoading(true);
    setWizardError(null);
    const sponsorMemberId = wizardForm.sponsor_member_id;
    const submitPayload = (statusToSend: Sponsorship["status"]): SponsorshipPayload => ({
        sponsor_member_id: sponsorMemberId,
        beneficiary_name: beneficiaryName,
        monthly_amount: Number(wizardForm.monthly_amount),
        start_date: wizardForm.start_date,
        end_date: wizardForm.end_date || undefined,
        last_sponsored_date: wizardForm.last_sponsored_date || undefined,
        payment_information: wizardForm.payment_information || undefined,
        last_status: wizardForm.last_status || undefined,
        last_status_reason: wizardForm.last_status === "Rejected" ? wizardForm.last_status_reason || undefined : undefined,
        frequency: wizardForm.frequency,
        program: wizardForm.program || undefined,
        pledge_channel: wizardForm.pledge_channel || undefined,
        reminder_channel: wizardForm.reminder_channel || undefined,
        motivation: wizardForm.motivation || undefined,
        volunteer_services: wizardForm.volunteer_services.length ? wizardForm.volunteer_services : undefined,
        volunteer_service_other: wizardForm.volunteer_service_other || undefined,
        budget_month: wizardForm.budget_month ? Number(wizardForm.budget_month) : undefined,
        budget_year: wizardForm.budget_year ? Number(wizardForm.budget_year) : undefined,
        budget_round_id: wizardForm.budget_round_id ? Number(wizardForm.budget_round_id) : null,
        budget_slots: resolvedBudgetSlots,
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
    setStatusError(null);
    setStatusModal({ open: true, sponsorship, nextStatus, title, reasonRequired });
  };

  const closeStatusModal = () => {
    setStatusModal({ open: false, sponsorship: null, nextStatus: null, title: "", reasonRequired: false });
    setStatusReason("");
    setStatusError(null);
  };

  const openBudgetAllocation = (item: Sponsorship) => {
    setBudgetTargetCase(item);
    setBudgetEdits((prev) => ({
      ...prev,
      [item.id]: {
        budget_round_id: String(item.budget_round_id ?? ""),
        budget_slots: String(item.budget_slots || 1),
      },
    }));
    setActiveView("budget");
    updateSearchParams({ view: "budget", budget_case: String(item.id) });
    setBudgetRefreshTick((prev) => prev + 1);
    closeStatusModal();
  };

  const isBudgetTransitionError = (message: string) =>
    /budget round|remaining slot|remaining slots|round .*full/i.test(message);

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
      closeStatusModal();
      handleRefresh();
    } catch (error) {
      console.error(error);
      const message = parseApiErrorMessage(error, "Unable to update case.");
      setStatusError(message);
      toast.push(message, "error");
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleDeleteCase = async (item: Sponsorship) => {
    const confirmed = window.confirm(`Delete SP-${String(item.id).padStart(4, "0")}?`);
    if (!confirmed) return;
    try {
      await deleteSponsorship(item.id);
      toast.push("Sponsorship case deleted.");
      handleRefresh();
    } catch (error) {
      console.error(error);
      toast.push(parseApiErrorMessage(error, "Unable to delete sponsorship case."), "error");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sponsorship Management</h1>
          <p className="text-sm text-mute">Case-based sponsorship tracking with co-sponsor and immigrant context.</p>
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
              variant={activeView === "prescreen" ? "solid" : "ghost"}
              onClick={() => handleViewChange("prescreen")}
            >
              Pre-screening
            </Button>
            <Button
              variant={activeView === "budget" ? "solid" : "ghost"}
              onClick={() => handleViewChange("budget")}
            >
              Allocated Sponsor
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
          {activeView === "cases" && (
            <>
              <Button
                variant="ghost"
                onClick={() => handleCaseExport("csv")}
                disabled={Boolean(exportingFormat)}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingFormat === "csv"
                  ? "Preparing CSV…"
                  : anyCaseSelected
                    ? `Export selected CSV (${selectedCaseArray.length})`
                    : "Export CSV"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleCaseExport("xlsx")}
                disabled={Boolean(exportingFormat)}
              >
                <Download className="h-4 w-4 mr-2" />
                {exportingFormat === "xlsx"
                  ? "Preparing Excel…"
                  : anyCaseSelected
                    ? `Export selected Excel (${selectedCaseArray.length})`
                    : "Export Excel"}
              </Button>
            </>
          )}
          {activeView === "prescreen" && (
            <Button
              variant="ghost"
              onClick={handlePrescreenExport}
              disabled={Boolean(exportingFormat) || prescreenLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              {exportingFormat === "xlsx"
                ? "Preparing Excel…"
                : anyPrescreenSelected
                  ? `Export selected Excel (${selectedPrescreenArray.length})`
                  : "Export filtered Excel"}
            </Button>
          )}
          <Button variant="ghost" onClick={handleRefresh}>
            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          {canManage && (
            <Button data-tour="sponsorship-wizard" onClick={handleWizardOpen}>
              <PlusCircle className="h-4 w-4 mr-2" /> New Sponsorship
            </Button>
          )}
        </div>
      </div>

      {activeView !== "prescreen" && (
      <div data-tour="sponsorship-metrics" className="grid gap-3 md:grid-cols-4 xl:grid-cols-5">
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
          <p className="text-xs uppercase text-mute">Allocated sponsor utilization</p>
          <p className="text-2xl font-semibold">
            {metrics?.budget_utilization_percent ?? "—"}
            {metrics ? "%" : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-mute">Declined cases</p>
          <p className="text-2xl font-semibold">{metrics?.suspended_cases ?? "—"}</p>
        </Card>
      </div>
      )}

      {activeView === "cases" && (
        <>
          <Card className="p-4 space-y-3" data-tour="sponsorship-filters">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 w-full md:max-w-md">
            <Search className="h-4 w-4 text-mute" />
            <Input
              placeholder="Search co-sponsor or immigrant"
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
                {status === "Suspended" ? "Declined" : status}
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
                <label className="text-xs uppercase text-mute block mb-1">Immigrant type</label>
                <Select
                  value={filters.beneficiary_type}
                  onChange={(event) => setFilters((prev) => ({ ...prev, beneficiary_type: event.target.value, page: 1 }))}
                >
                  <option value="">All</option>
                  <option value="External">External</option>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Co-sponsor</label>
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

          <Card className="overflow-hidden" data-tour="sponsorship-list">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Cases</p>
            {anyCaseSelected && <Badge variant="outline">{selectedCaseArray.length} selected</Badge>}
          </div>
          <Badge variant="outline">{sponsorships?.total ?? 0} total</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-mute">
              <tr>
                <th className="px-3 py-2 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={handleToggleSelectAllVisible}
                    aria-label="Select all visible sponsorship cases"
                    className="accent-accent"
                  />
                </th>
                <th className="px-4 py-2 text-left">Case ID</th>
                <th className="px-4 py-2 text-left">Co-sponsor</th>
                <th className="px-4 py-2 text-left">Immigrant</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Last sponsored date</th>
                <th className="px-4 py-2 text-left">Next action</th>
                <th className="px-4 py-2 text-left">Actions</th>
                <th className="px-4 py-2 text-left">Last update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-mute">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                    Loading cases...
                  </td>
                </tr>
              ) : sponsorships?.items.length ? (
                sponsorships.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedCaseIds.has(item.id)}
                        onChange={() => handleToggleCaseSelection(item.id)}
                        aria-label={`Select sponsorship case ${item.id}`}
                        className="accent-accent"
                      />
                    </td>
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
                        {statusLabel(item.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-2">{formatDate(item.last_sponsored_date)}</td>
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
                              onClick={() => openStatusModal(item, "Approved", "Approve case", true)}
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
                          item.budget_round_id ? (
                            <Button size="sm" onClick={() => openStatusModal(item, "Active", "Activate case", false)}>
                              Activate
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => openBudgetAllocation(item)}>
                              Assign budget
                            </Button>
                          )
                        )}
                        {canManage && item.status === "Active" && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => openStatusModal(item, "Suspended", "Decline case", true)}>
                              Decline
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
                        {canManage && item.status === "Completed" && (
                          <Button size="sm" variant="outline" onClick={() => openStatusModal(item, "Active", "Reverse completed case", true)}>
                            Reverse
                          </Button>
                        )}
                        {canManage && canDeleteSponsorshipCase(item) && (
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteCase(item)}>
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2">{formatDate(item.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-mute">
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

      {activeView === "prescreen" && (
        <div className="space-y-4">
          <Card className="overflow-hidden border-slate-200">
            <div className="border-b border-border bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
                    <ShieldCheck className="h-4 w-4" />
                    Sponsor readiness
                  </div>
                  <h2 className="text-xl font-semibold">Member sponsorship pre-screening</h2>
                  <p className="mt-1 text-sm text-slate-300">
                    A live qualification view using membership tenure, payment health, sponsorship history, and volunteer evidence.
                  </p>
                </div>
                <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-xs text-slate-300">
                  Required: active member, {prescreening?.tenure_requirement_months ?? 12}+ months, current payment,
                  and configured consecutive-payment streak.
                </div>
              </div>
            </div>
            <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-6">
              {[
                { label: "Screened", value: prescreening?.summary.total, tone: "text-slate-900" },
                { label: "Eligible", value: prescreening?.summary.eligible, tone: "text-emerald-700" },
                { label: "Needs review", value: prescreening?.summary.review, tone: "text-amber-700" },
                { label: "Not eligible", value: prescreening?.summary.not_eligible, tone: "text-rose-700" },
                { label: "Volunteers", value: prescreening?.summary.volunteers, tone: "text-sky-700" },
                { label: "Payments current", value: prescreening?.summary.payments_current, tone: "text-violet-700" },
              ].map((metric) => (
                <div key={metric.label} className="px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-mute">{metric.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${metric.tone}`}>{metric.value ?? "—"}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_190px_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-mute" />
                <Input
                  className="pl-9"
                  placeholder="Search member, email, phone, or username"
                  value={prescreenFilters.q}
                  onChange={(event) =>
                    setPrescreenFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))
                  }
                />
              </div>
              <Select
                value={prescreenFilters.eligibility}
                onChange={(event) =>
                  setPrescreenFilters((prev) => ({ ...prev, eligibility: event.target.value, page: 1 }))
                }
              >
                <option value="">All eligibility</option>
                <option value="Eligible">Eligible</option>
                <option value="Review">Needs review</option>
                <option value="NotEligible">Not eligible</option>
              </Select>
              <Select
                value={prescreenFilters.volunteer}
                onChange={(event) =>
                  setPrescreenFilters((prev) => ({ ...prev, volunteer: event.target.value, page: 1 }))
                }
              >
                <option value="">All volunteer evidence</option>
                <option value="true">Volunteer evidence found</option>
                <option value="false">No volunteer evidence</option>
              </Select>
              <Button
                variant="ghost"
                onClick={() => setPrescreenFilters({ q: "", eligibility: "", volunteer: "", page: 1 })}
              >
                Clear filters
              </Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Qualification roster</p>
                <p className="text-xs text-mute">Expand a member to see every signal and the evidence behind it.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {anyPrescreenSelected && <Badge>{selectedPrescreenArray.length} selected</Badge>}
                <Badge>{prescreening?.total ?? 0} members</Badge>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1420px] table-fixed text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-mute">
                  <tr>
                    <th className="w-[44px] px-3 py-3">
                      <input
                        type="checkbox"
                        checked={allVisiblePrescreenSelected}
                        onChange={handleToggleSelectAllVisiblePrescreen}
                        aria-label="Select all visible pre-screening members"
                        className="accent-accent"
                      />
                    </th>
                    <th className="w-[230px] px-4 py-3">Member</th>
                    <th className="w-[190px] px-4 py-3">Decision</th>
                    <th className="w-[190px] px-4 py-3">Membership</th>
                    <th className="w-[220px] px-4 py-3">Payment continuity</th>
                    <th className="w-[220px] px-4 py-3">Sponsorship history</th>
                    <th className="w-[210px] px-4 py-3">Volunteer evidence</th>
                    <th className="w-[160px] px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prescreenLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-mute">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Calculating member eligibility...
                      </td>
                    </tr>
                  ) : prescreening?.items.length ? (
                    prescreening.items.map((item) => {
                      const expanded = expandedPrescreenMemberId === item.member_id;
                      const paymentCriterion = item.criteria.find((criterion) => criterion.code === "payment_current");
                      const tenureCriterion = item.criteria.find((criterion) => criterion.code === "membership_tenure");
                      return (
                        <Fragment key={item.member_id}>
                          <tr
                            className="border-t border-border/70 align-top transition-colors hover:bg-muted/20"
                          >
                            <td className="px-3 py-4">
                              <input
                                type="checkbox"
                                checked={selectedPrescreenMemberIds.has(item.member_id)}
                                onChange={() => handleTogglePrescreenSelection(item.member_id)}
                                aria-label={`Select ${item.member_name} for export`}
                                className="accent-accent"
                              />
                            </td>
                            <td className="px-4 py-4">
                              <button
                                className="flex items-start gap-3 text-left"
                                onClick={() => setExpandedPrescreenMemberId(expanded ? null : item.member_id)}
                              >
                                <span className="mt-0.5 rounded-lg border border-border bg-muted/40 p-1.5">
                                  <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                </span>
                                <span>
                                  <span className="block font-semibold text-ink">{item.member_name}</span>
                                  <span className="block text-xs text-mute">@{item.username}</span>
                                  <span className="mt-1 block text-xs text-mute">{item.member_phone || item.member_email || "No contact"}</span>
                                </span>
                              </button>
                            </td>
                            <td className="px-4 py-4">
                              <div>
                                <Badge className={PRESCREEN_ELIGIBILITY_STYLES[item.eligibility]}>
                                  {eligibilityLabel(item.eligibility)}
                                </Badge>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.eligibility === "Eligible"
                                        ? "bg-emerald-500"
                                        : item.eligibility === "Review"
                                          ? "bg-amber-500"
                                          : "bg-rose-500"
                                    }`}
                                    style={{ width: `${item.score}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold">{item.score}/100</span>
                              </div>
                              {item.blocking_reasons.length > 0 && (
                                <p className="mt-2 max-w-[210px] text-xs text-rose-700">{item.blocking_reasons[0]}</p>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-4 w-4 text-sky-600" />
                                <span className="font-medium">{tenureLabel(item.tenure_months)}</span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-mute">
                                <span className="block text-[10px] font-medium uppercase tracking-wide">Started</span>
                                <span className="block text-ink/80">{formatDate(item.join_date)}</span>
                              </p>
                              {tenureCriterion && (
                                <div className="mt-3">
                                  <Badge className={PRESCREEN_CRITERION_STYLES[tenureCriterion.status]}>
                                    {tenureCriterion.status}
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <CreditCard className="h-4 w-4 text-violet-600" />
                                <span className="font-medium">
                                  {item.consecutive_payment_months}/{item.required_consecutive_payment_months} months
                                </span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-mute">
                                <span className="block text-[10px] font-medium uppercase tracking-wide">Last paid</span>
                                <span className="block text-ink/80">{formatDate(item.last_payment_at)}</span>
                              </p>
                              {paymentCriterion && (
                                <div className="mt-3">
                                  <Badge className={PRESCREEN_CRITERION_STYLES[paymentCriterion.status]}>
                                    {paymentCriterion.status === "Pass"
                                      ? "Current"
                                      : item.payment_overdue_days
                                        ? `${item.payment_overdue_days} days overdue`
                                        : paymentCriterion.status}
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <p className="font-medium">{item.sponsorship_count} total cases</p>
                              <p className="mt-1 text-xs text-mute">
                                {item.active_sponsorship_count} active · {item.completed_sponsorship_count} completed
                              </p>
                              <p className="mt-2 max-w-[190px] text-xs text-mute">
                                Last: {item.last_beneficiary_name || "No sponsorship history"} {item.last_sponsorship_date ? `· ${formatDate(item.last_sponsorship_date)}` : ""}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <HeartHandshake className={`h-4 w-4 ${item.is_volunteer ? "text-emerald-600" : "text-slate-400"}`} />
                                <span className="font-medium">{item.is_volunteer ? `${item.volunteer_service_count} records` : "Not found"}</span>
                              </div>
                              <p className="mt-2 text-xs leading-5 text-mute">
                                <span className="block text-[10px] font-medium uppercase tracking-wide">Last service</span>
                                <span className="block text-ink/80">{formatDate(item.last_volunteer_service_date)}</span>
                              </p>
                              {item.volunteer_match_method && (
                                <div className="mt-3">
                                  <Badge className="border-sky-200 bg-sky-50 text-sky-700">
                                    Matched by {item.volunteer_match_method}
                                  </Badge>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-col items-end gap-2">
                                {canManage && item.eligibility === "Eligible" && (
                                  <Button className="px-3 py-1.5 text-xs" onClick={() => handleStartFromPrescreen(item)}>
                                    Start sponsorship
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  className="px-3 py-1.5 text-xs"
                                  onClick={() => navigate(`/members/${item.member_id}/edit`)}
                                >
                                  View member
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {expanded && (
                            <tr key={`${item.member_id}-details`} className="border-t border-border bg-slate-50/70">
                              <td colSpan={8} className="px-5 py-5">
                                <motion.div
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="grid gap-5 lg:grid-cols-[1.3fr_1fr_1fr]"
                                >
                                  <div>
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Eligibility evidence</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {item.criteria.map((criterion) => (
                                        <div key={criterion.code} className="rounded-xl border border-border bg-white p-3">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="min-w-0 font-medium">{criterion.label}</p>
                                            <Badge className={`shrink-0 ${PRESCREEN_CRITERION_STYLES[criterion.status]}`}>
                                              <span className="flex items-center gap-1">
                                                <PrescreenCriterionIcon status={criterion.status} />
                                                {criterion.status}
                                              </span>
                                            </Badge>
                                          </div>
                                          <p className="mt-2 text-xs leading-relaxed text-mute">{criterion.detail}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Payment detail</p>
                                    <div className="space-y-2 rounded-xl border border-border bg-white p-4 text-xs">
                                      <div className="flex justify-between gap-3"><span className="text-mute">Last payment</span><strong>{formatDate(item.last_payment_at)}</strong></div>
                                      <div className="flex justify-between gap-3"><span className="text-mute">Next due</span><strong>{formatDate(item.next_payment_due_at)}</strong></div>
                                      <div className="flex justify-between gap-3"><span className="text-mute">Consecutive months</span><strong>{item.consecutive_payment_months}</strong></div>
                                      <div className="flex justify-between gap-3"><span className="text-mute">Contribution exception</span><strong>{item.contribution_exception_reason || "None"}</strong></div>
                                    </div>
                                  </div>
                                  <div>
                                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-mute">Volunteer detail</p>
                                    <div className="space-y-3 rounded-xl border border-border bg-white p-4 text-xs">
                                      <div>
                                        <span className="text-mute">Groups</span>
                                        <p className="mt-1 font-medium">{item.volunteer_groups.join(", ") || "No group evidence"}</p>
                                      </div>
                                      <div>
                                        <span className="text-mute">Service types</span>
                                        <p className="mt-1 font-medium">{item.volunteer_service_types.join(", ") || "No service evidence"}</p>
                                      </div>
                                      <p className="rounded-lg bg-sky-50 p-2 text-sky-800">
                                        Volunteer evidence is matched conservatively by phone first, then exact full name, and does not determine eligibility by itself.
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-mute">
                        No members match these pre-screening filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                disabled={prescreenFilters.page <= 1}
                onClick={() => setPrescreenFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
              >
                Prev
              </Button>
              <span className="text-xs text-mute">Page {prescreenFilters.page} of {prescreenTotalPages}</span>
              <Button
                variant="ghost"
                className="px-3 py-1.5 text-xs"
                disabled={prescreenFilters.page >= prescreenTotalPages}
                onClick={() => setPrescreenFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activeView === "budget" && (
        <div className="space-y-4">
          {canViewBudgetRoundAdmin ? (
            <Card className="p-4 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-mute">Allocated sponsor setup</p>
                  <p className="text-sm text-mute">
                    Define how many sponsorship slots the church will allocate per round. Use 2–3 rounds for the year when needed.
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Allocated year</label>
                    <Select value={roundYear} onChange={(event) => setRoundYear(event.target.value)}>
                      {YEAR_OPTIONS.map((year) => (
                        <option key={year} value={String(year)}>
                          {year}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button variant="ghost" onClick={() => setRoundRefreshTick((prev) => prev + 1)}>
                    Refresh rounds
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs uppercase text-mute">Configured rounds</p>
                  <p className="text-xl font-semibold">{budgetRoundTotals.rounds}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs uppercase text-mute">Allocated sponsor slots</p>
                  <p className="text-xl font-semibold">{budgetRoundTotals.slots}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs uppercase text-mute">Used slots</p>
                  <p className="text-xl font-semibold">{budgetRoundTotals.used}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs uppercase text-mute">Utilization</p>
                  <p className="text-xl font-semibold">{budgetRoundTotals.utilization}%</p>
                </Card>
              </div>

              <div className="overflow-x-auto border border-border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-mute">
                    <tr>
                      <th className="px-4 py-2 text-left">Round</th>
                      <th className="px-4 py-2 text-left">Start date</th>
                      <th className="px-4 py-2 text-left">End date</th>
                      <th className="px-4 py-2 text-left">Allocated sponsor slots</th>
                      <th className="px-4 py-2 text-left">Allocated</th>
                      <th className="px-4 py-2 text-left">Used</th>
                      <th className="px-4 py-2 text-left">Utilization</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roundsLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                          <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                          Loading rounds...
                        </td>
                      </tr>
                    ) : budgetRounds.length ? (
                      budgetRounds.map((round) => {
                        const draft = getRoundDraft(round);
                        const saving = roundSavingId === round.id;
                        const deleting = roundDeletingId === round.id;
                        return (
                          <tr key={round.id} className="border-t border-border/60">
                            <td className="px-4 py-2">
                              {canManageBudgetRounds ? (
                                <Select
                                  value={draft.round_number}
                                  onChange={(event) => handleRoundFieldChange(round, "round_number", event.target.value)}
                                >
                                  {ROUND_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      Round {option}
                                    </option>
                                  ))}
                                </Select>
                              ) : (
                                <span>Round {round.round_number}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {canManageBudgetRounds ? (
                                <Input
                                  type="date"
                                  value={draft.start_date}
                                  onChange={(event) => handleRoundFieldChange(round, "start_date", event.target.value)}
                                />
                              ) : (
                                formatDate(round.start_date)
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {canManageBudgetRounds ? (
                                <Input
                                  type="date"
                                  value={draft.end_date}
                                  onChange={(event) => handleRoundFieldChange(round, "end_date", event.target.value)}
                                />
                              ) : (
                                formatDate(round.end_date)
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {canManageBudgetRounds ? (
                                <Input
                                  type="number"
                                  min={1}
                                  value={draft.slot_budget}
                                  onChange={(event) => handleRoundFieldChange(round, "slot_budget", event.target.value)}
                                />
                              ) : (
                                round.slot_budget
                              )}
                            </td>
                            <td className="px-4 py-2">{round.allocated_slots}</td>
                            <td className="px-4 py-2">{round.used_slots}</td>
                            <td className="px-4 py-2">{round.utilization_percent}%</td>
                            <td className="px-4 py-2">
                              {canManageBudgetRounds ? (
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={() => handleRoundSave(round)} disabled={saving}>
                                    {saving ? "Saving..." : "Save"}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRoundDelete(round)}
                                    disabled={deleting}
                                  >
                                    {deleting ? "Removing..." : "Remove"}
                                  </Button>
                                </div>
                              ) : (
                                <span className="text-xs text-mute">Read only</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                          No rounds configured for {roundYear} yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {roundsError && <p className="text-xs text-rose-600">{roundsError}</p>}

              {canManageBudgetRounds && (
                <div className="border-t border-border pt-4 space-y-3">
                  <p className="text-sm font-medium">Add a round</p>
                  <div className="grid gap-3 md:grid-cols-5">
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Round</label>
                      <Select
                        value={newRoundDraft.round_number}
                        onChange={(event) =>
                          setNewRoundDraft((prev) => ({ ...prev, round_number: event.target.value }))
                        }
                      >
                        <option value="">Select</option>
                        {ROUND_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            Round {option}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Start date</label>
                      <Input
                        type="date"
                        value={newRoundDraft.start_date}
                        onChange={(event) => setNewRoundDraft((prev) => ({ ...prev, start_date: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">End date</label>
                      <Input
                        type="date"
                        value={newRoundDraft.end_date}
                        onChange={(event) => setNewRoundDraft((prev) => ({ ...prev, end_date: event.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Allocated sponsor slots</label>
                      <Input
                        type="number"
                        min={1}
                        value={newRoundDraft.slot_budget}
                        onChange={(event) => setNewRoundDraft((prev) => ({ ...prev, slot_budget: event.target.value }))}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleRoundCreate} disabled={roundSavingId === "new"}>
                        {roundSavingId === "new" ? "Adding..." : "Add round"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-4 text-sm text-mute">
              Allocated sponsor setup is restricted to roles with Sponsorships &gt; Budget Rounds access. Existing rounds still appear in the wizard and case allocation screens.
            </Card>
          )}

          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Allocated month</label>
                <Select
                  value={budgetMonth}
                  onChange={(event) => {
                    setBudgetTargetCase(null);
                    setBudgetMonth(event.target.value);
                  }}
                >
                  {MONTH_OPTIONS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Allocated year</label>
                <Select
                  value={budgetYear}
                  onChange={(event) => {
                    setBudgetTargetCase(null);
                    setBudgetYear(event.target.value);
                  }}
                >
                  {YEAR_OPTIONS.map((year) => (
                    <option key={year} value={String(year)}>
                      {year}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="ghost" onClick={() => setBudgetRefreshTick((prev) => prev + 1)}>
                Refresh allocation
              </Button>
            </div>
            <p className="mt-3 text-xs text-mute">
              Manage round assignments and slot requests. Used slots are consumed automatically when a case moves out of draft.
            </p>
            {budgetTargetCase && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span>
                  Showing SP-{String(budgetTargetCase.id).padStart(4, "0")} because it needs a budget round before the next status change.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBudgetTargetCase(null);
                    updateSearchParams({ budget_case: null });
                  }}
                >
                  Show month allocation
                </Button>
              </div>
            )}
          </Card>

          <div className="grid gap-3 md:grid-cols-3">
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
          </div>

          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-medium">Allocated sponsor cases</p>
              <Badge variant="outline">{budgetCases?.total ?? 0} total</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-mute">
                  <tr>
                    <th className="px-4 py-2 text-left">Case ID</th>
                    <th className="px-4 py-2 text-left">Co-sponsor</th>
                    <th className="px-4 py-2 text-left">Immigrant</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Allocated sponsor round</th>
                    <th className="px-4 py-2 text-left">Allocated sponsor slots</th>
                    <th className="px-4 py-2 text-left">Used slots</th>
                    <th className="px-4 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {budgetLoading ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-sm text-mute">
                        <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                        Loading allocation...
                      </td>
                    </tr>
                  ) : budgetCases?.items.length ? (
                    budgetCases.items.map((item) => {
                      const draft = getBudgetDraft(item);
                      const saving = budgetSavingId === item.id;
                      const itemConsumesBudget = sponsorshipConsumesBudget(item.status);
                      return (
                        <tr key={item.id} className="border-t border-border/60">
                          <td className="px-4 py-2 font-medium">SP-{String(item.id).padStart(4, "0")}</td>
                          <td className="px-4 py-2">
                            {item.sponsor.first_name} {item.sponsor.last_name}
                          </td>
                          <td className="px-4 py-2">{beneficiaryLabel(item)}</td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className={STATUS_STYLES[item.status]}>
                              {statusLabel(item.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <Select
                              value={draft.budget_round_id}
                              onChange={(event) => handleBudgetFieldChange(item.id, "budget_round_id", event.target.value)}
                            >
                              <option value="" disabled={itemConsumesBudget}>No round</option>
                              {budgetRounds.map((round) => (
                                <option
                                  key={round.id}
                                  value={String(round.id)}
                                  disabled={getAvailableSlotsForRound(round, item) <= 0 && String(round.id) !== draft.budget_round_id}
                                >
                                  Round {round.round_number} ({round.year}) • {getAvailableSlotsForRound(round, item)} remaining
                                </option>
                              ))}
                            </Select>
                            {itemConsumesBudget && (
                              <p className="text-[11px] text-mute mt-1">This sponsorship must stay assigned to a round.</p>
                            )}
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
                            <span className="font-medium">{item.used_slots}</span>
                            <p className="text-[11px] text-mute">System managed</p>
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
                        No allocated sponsor cases found for this period.
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
                      <label className="text-xs uppercase text-mute block mb-1">Co-sponsor search</label>
                    <Input
                      placeholder={canSearchSponsors ? "Search member by name" : "You do not have permission to search co-sponsors"}
                      value={sponsorSearch}
                      disabled={!canSearchSponsors}
                      onChange={(event) => setSponsorSearch(event.target.value)}
                    />
                    {!canSearchSponsors && (
                      <p className="text-xs text-amber-600 mt-1">
                        {sponsorSearchPermissionHint}
                      </p>
                    )}
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
                          Last sponsored co-sponsor: {sponsorContext.last_sponsorship_name || "None"}
                          {sponsorContext.last_sponsorship_status ? ` • ${statusLabel(sponsorContext.last_sponsorship_status as Sponsorship["status"])}` : ""}
                        </div>
                        <div className="text-sm text-mute">
                          Co-sponsor contact: {[sponsorContext.member_phone, sponsorContext.member_email].filter(Boolean).join(" • ") || "Not set"}
                        </div>
                        <div className="text-sm text-mute">
                          Co-sponsorships (last 12 months): {sponsorContext.history_count_last_12_months}
                        </div>
                        <div className="text-sm text-mute">
                          Volunteer services: {sponsorContext.volunteer_services.length ? sponsorContext.volunteer_services.join(", ") : "None"}
                        </div>
                        <div className="text-sm text-mute">
                          Father of Confession: {sponsorContext.father_of_repentance_name || "Not set"}
                        </div>
                        {sponsorContext.marital_status === "Married" && (
                          <div className="text-sm text-mute">
                            Spouse: {sponsorContext.spouse_name || "Not set in family profile"}
                            {sponsorContext.spouse_phone ? ` • ${sponsorContext.spouse_phone}` : ""}
                            {sponsorContext.spouse_email ? ` • ${sponsorContext.spouse_email}` : ""}
                          </div>
                        )}
                        {sponsorContext.budget_usage && (
                          <div className="text-sm text-mute">
                            Allocated sponsor usage: {sponsorContext.budget_usage.used_slots}/{sponsorContext.budget_usage.total_slots}
                          </div>
                        )}
                        {paymentHistoryAvailable ? (
                          <div className="pt-2 border-t border-border/60 space-y-3">
                            <div className="text-xs uppercase text-mute">
                              Payment continuity ({paymentHistoryRangeLabel ?? "Last 36 months"})
                            </div>
                            {paymentHistory.length ? (
                              <>
                                <div className="flex flex-wrap gap-4 text-sm text-mute">
                                  <div>
                                    <span className="font-medium text-ink">
                                      {paymentContinuity?.paidMonths ?? 0}/{paymentContinuity?.totalMonths ?? 0}
                                    </span>{" "}
                                    months paid
                                  </div>
                                  <div>Continuity: {paymentContinuity?.continuityPercent ?? 0}%</div>
                                  <div>Missed: {paymentContinuity?.missedMonths ?? 0}</div>
                                  <div>Last payment: {formatDate(paymentContinuity?.lastPaymentAt)}</div>
                                </div>
                                <div className="space-y-2">
                                  {paymentContinuity?.segments.map((segment) => (
                                    <div key={segment.label} className="flex items-center gap-2">
                                      <div className="w-36 text-[11px] text-mute">{segment.label}</div>
                                      <div className="grid grid-cols-12 gap-1 flex-1 min-w-[160px]">
                                        {segment.months.map((month) => (
                                          <div
                                            key={month.key}
                                            className={`h-2.5 rounded-sm ${
                                              month.paid ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"
                                            }`}
                                            title={`${month.label} ${month.year}: ${
                                              month.paid
                                                ? `${month.paymentCount} payment${month.paymentCount > 1 ? "s" : ""}`
                                                : "No payment"
                                            }`}
                                          />
                                        ))}
                                      </div>
                                      <div className="text-[11px] text-mute w-12 text-right">
                                        {segment.paidMonths}/12
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs text-mute">
                                  Darker squares indicate months with at least one membership contribution.
                                </div>
                                <div className="pt-2">
                                  <div className="text-xs uppercase text-mute">
                                    Payment history ({paymentHistoryRangeLabel ?? "Last 36 months"})
                                  </div>
                                  <div className="mt-2 border border-border rounded-lg max-h-48 overflow-y-auto">
                                    <table className="w-full text-sm">
                                      <thead className="text-xs uppercase text-mute bg-muted/40">
                                        <tr>
                                          <th className="px-3 py-2 text-left">Date</th>
                                          <th className="px-3 py-2 text-left">Amount</th>
                                          <th className="px-3 py-2 text-left">Method</th>
                                          <th className="px-3 py-2 text-left">Note</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {paymentHistory.map((payment) => (
                                          <tr key={payment.id} className="border-t border-border/60">
                                            <td className="px-3 py-2">{formatDate(payment.paid_at)}</td>
                                            <td className="px-3 py-2">
                                              {payment.currency}{" "}
                                              {payment.amount.toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </td>
                                            <td className="px-3 py-2">{payment.method || "—"}</td>
                                            <td className="px-3 py-2">{payment.note || "—"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                  {permissions.viewPayments && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="mt-2"
                                      onClick={() => navigate(`/payments/members/${sponsorContext.member_id}`)}
                                    >
                                      View full payment timeline
                                    </Button>
                                  )}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-mute">
                                No membership contribution payments recorded in the last 36 months.
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-mute">Payment continuity unavailable.</div>
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
                    <div className="space-y-3">
                      <label className="text-xs uppercase text-mute block">External immigrant name</label>
                      <div className="grid gap-3 md:grid-cols-2">
                        <Input
                          placeholder="First name"
                          value={wizardForm.beneficiary_first_name}
                          onChange={(event) =>
                            setWizardForm((prev) => ({
                              ...prev,
                              beneficiary_mode: "external",
                              beneficiary_member_id: null,
                              newcomer_id: null,
                              beneficiary_first_name: event.target.value,
                              beneficiary_name: `${event.target.value.trim()} ${prev.beneficiary_last_name.trim()}`.trim(),
                            }))
                          }
                        />
                        <Input
                          placeholder="Last name"
                          value={wizardForm.beneficiary_last_name}
                          onChange={(event) =>
                            setWizardForm((prev) => ({
                              ...prev,
                              beneficiary_mode: "external",
                              beneficiary_member_id: null,
                              newcomer_id: null,
                              beneficiary_last_name: event.target.value,
                              beneficiary_name: `${prev.beneficiary_first_name.trim()} ${event.target.value.trim()}`.trim(),
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex justify-between">
                      <Button variant="ghost" onClick={() => setWizardStep(0)}>
                        Back
                      </Button>
                      <Button
                        onClick={() => setWizardStep(2)}
                        disabled={!wizardForm.beneficiary_first_name.trim() || !wizardForm.beneficiary_last_name.trim()}
                      >
                        Continue <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Last sponsored date</label>
                        <Input
                          type="date"
                          value={wizardForm.last_sponsored_date}
                          onChange={(event) => setWizardForm((prev) => ({ ...prev, last_sponsored_date: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Bond</label>
                        <Input
                          placeholder="Membership monthly payment"
                          value={wizardForm.payment_information}
                          onChange={(event) => setWizardForm((prev) => ({ ...prev, payment_information: event.target.value }))}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs uppercase text-mute block mb-1">Last sponsored status</label>
                      <div className="flex flex-wrap gap-4 text-sm text-mute">
                        {["Approved", "Rejected"].map((status) => (
                          <label key={status} className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="last-sponsored-status"
                              checked={wizardForm.last_status === status}
                              onChange={() =>
                                setWizardForm((prev) => ({
                                  ...prev,
                                  last_status: status as Sponsorship["last_status"],
                                  last_status_reason: status === "Rejected" ? prev.last_status_reason : "",
                                }))
                              }
                            />
                            {status}
                          </label>
                        ))}
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="last-sponsored-status"
                            checked={!wizardForm.last_status}
                            onChange={() => setWizardForm((prev) => ({ ...prev, last_status: "", last_status_reason: "" }))}
                          />
                          Not set
                        </label>
                      </div>
                      {wizardForm.last_status === "Rejected" && (
                        <div className="mt-2 space-y-3">
                          <Textarea
                            placeholder="Rejection reason (required)"
                            value={wizardForm.last_status_reason}
                            onChange={(event) => setWizardForm((prev) => ({ ...prev, last_status_reason: event.target.value }))}
                          />
                          <div>
                            <label className="text-xs uppercase text-mute block mb-1">Case summary / notes</label>
                            <Textarea
                              rows={4}
                              value={wizardForm.notes}
                              onChange={(event) => setWizardForm((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    {wizardForm.last_status !== "Rejected" && (
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Case summary / notes</label>
                        <Textarea
                          rows={4}
                          value={wizardForm.notes}
                          onChange={(event) => setWizardForm((prev) => ({ ...prev, notes: event.target.value }))}
                        />
                      </div>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      <Select
                        value={wizardForm.program ?? ""}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, program: event.target.value as Sponsorship["program"] | "" }))}
                      >
                        <option value="">Program (optional)</option>
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
                        value={wizardForm.pledge_channel ?? ""}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, pledge_channel: event.target.value as Sponsorship["pledge_channel"] | "" }))}
                      >
                        <option value="">Pledge channel (optional)</option>
                        {SPONSORSHIP_PLEDGE_CHANNEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      <Select
                        value={wizardForm.reminder_channel ?? ""}
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
                        value={wizardForm.motivation ?? ""}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, motivation: event.target.value as Sponsorship["motivation"] | "" }))}
                      >
                        <option value="">Motivation (optional)</option>
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
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Allocated sponsor year</label>
                        <Select
                          value={roundYear}
                          onChange={(event) => setRoundYear(event.target.value)}
                        >
                          {YEAR_OPTIONS.map((year) => (
                            <option key={year} value={String(year)}>
                              {year}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="text-xs uppercase text-mute block mb-1">Allocated sponsor round</label>
                        <Select
                          value={wizardForm.budget_round_id}
                          onChange={(event) =>
                            setWizardForm((prev) => ({
                              ...prev,
                              budget_round_id: event.target.value,
                              budget_year: event.target.value ? roundYear : prev.budget_year,
                              budget_slots: event.target.value ? prev.budget_slots || "1" : prev.budget_slots,
                            }))
                          }
                        >
                          <option value="">No round (draft only)</option>
                          {budgetRounds.map((round) => (
                            <option
                              key={round.id}
                              value={String(round.id)}
                              disabled={round.used_slots >= round.slot_budget && String(round.id) !== wizardForm.budget_round_id}
                            >
                              Round {round.round_number} ({round.year}) • {Math.max(round.slot_budget - round.used_slots, 0)} remaining
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    {roundsLoading && <p className="text-xs text-mute">Loading budget rounds...</p>}
                    {!roundsLoading && roundsError && (
                      <p className="text-xs text-rose-600">{roundsError}</p>
                    )}
                    {!roundsLoading && !roundsError && !budgetRounds.length && (
                      <p className="text-xs text-mute">No budget rounds configured for {roundYear} yet.</p>
                    )}
                    {!roundsLoading && !roundsError && allBudgetRoundsFull && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800">
                        All configured rounds for {roundYear} are full. Ask an admin to create the next round before submitting this sponsorship.
                      </div>
                    )}
                    {selectedWizardRound && (
                      <p className="text-xs text-mute">
                        Round capacity: {selectedWizardRound.used_slots}/{selectedWizardRound.slot_budget} used •{" "}
                        {selectedWizardRoundRemainingSlots ?? 0} remaining • {selectedWizardRound.utilization_percent}% utilized
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-3">
                      <Select
                        value={wizardForm.budget_month}
                        onChange={(event) => setWizardForm((prev) => ({ ...prev, budget_month: event.target.value }))}
                      >
                        <option value="">Allocated month</option>
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
                        <option value="">Allocated year</option>
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
                        <option value="">{wizardForm.budget_round_id ? "Default 1 slot" : "Allocated sponsor slots"}</option>
                        {SLOT_OPTIONS.filter((slot) => {
                          if (!selectedWizardRound) return true;
                          const remainingSlots = Math.max(selectedWizardRound.slot_budget - selectedWizardRound.used_slots, 0);
                          const currentSlots = Number(wizardForm.budget_slots || "0");
                          return slot <= Math.max(remainingSlots, currentSlots);
                        }).map((slot) => (
                          <option key={slot} value={String(slot)}>
                            {slot}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {wizardForm.budget_round_id && (
                      <p className="text-xs text-mute">
                        Submitted cases automatically consume the selected number of slots from the chosen round. Drafts do not.
                      </p>
                    )}
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
                      <p className="text-xs uppercase text-mute">Co-sponsor</p>
                      <p className="font-medium">{wizardForm.sponsor_name || "—"}</p>
                      <p className="text-xs uppercase text-mute mt-3">Immigrant</p>
                      <p className="font-medium">{wizardForm.beneficiary_name || "—"}</p>
                      <p className="text-xs uppercase text-mute mt-3">Last sponsored date</p>
                      <p className="font-medium">{formatDate(wizardForm.last_sponsored_date)}</p>
                      <p className="text-xs uppercase text-mute mt-3">Bond</p>
                      <p className="font-medium">{wizardForm.payment_information || "—"}</p>
                      <p className="text-xs uppercase text-mute mt-3">Last sponsored status</p>
                      <p className="font-medium">{wizardForm.last_status || "—"}</p>
                      {wizardForm.last_status === "Rejected" && (
                        <>
                          <p className="text-xs uppercase text-mute mt-3">Rejection reason</p>
                          <p className="font-medium">{wizardForm.last_status_reason || "—"}</p>
                        </>
                      )}
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
                      <p className="text-xs uppercase text-mute mt-3">Allocated sponsor round</p>
                      <p className="font-medium">
                        {selectedWizardRound
                          ? `Round ${selectedWizardRound.round_number} (${selectedWizardRound.year})`
                          : "—"}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Allocated sponsor period</p>
                      <p className="font-medium">
                        {wizardForm.budget_month && wizardForm.budget_year
                          ? `${wizardForm.budget_month}/${wizardForm.budget_year}`
                          : "—"}
                      </p>
                      <p className="text-xs uppercase text-mute mt-3">Allocated sponsor slots</p>
                      <p className="font-medium">{wizardForm.budget_round_id ? wizardForm.budget_slots || "1" : "—"}</p>
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
              onClick={closeStatusModal}
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
                  onClick={closeStatusModal}
                >
                  Close
                </Button>
              </div>
              <p className="text-sm text-mute">
                Update SP-{String(statusModal.sponsorship.id).padStart(4, "0")} to {statusModal.nextStatus}.
              </p>
              {statusModal.reasonRequired && (
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Reason</label>
                  <Textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={4} />
                </div>
              )}
              {statusError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p>{statusError}</p>
                  {isBudgetTransitionError(statusError) && (
                    <div className="mt-3">
                      <Button variant="outline" size="sm" onClick={() => openBudgetAllocation(statusModal.sponsorship!)}>
                        Open budget allocation
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={closeStatusModal}
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
