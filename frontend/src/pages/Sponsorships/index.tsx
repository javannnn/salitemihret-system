import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Filter,
  Globe,
  HandHeart,
  Handshake,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  PhoneCall,
  PlusCircle,
  RefreshCcw,
  Search,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { PhoneInput } from "@/components/PhoneInput";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import {
  Sponsorship,
  SponsorshipListResponse,
  SponsorshipMetrics,
  SponsorshipMotivation,
  SponsorshipNotesTemplate,
  SponsorshipPledgeChannel,
  SponsorshipProgram,
  SponsorshipReminderChannel,
  Member,
  MemberDetail,
  Priest,
  listSponsorships,
  getSponsorshipMetrics,
  createSponsorship,
  remindSponsorship,
  Newcomer,
  NewcomerListResponse,
  listNewcomers,
  createNewcomer,
  updateNewcomer,
  convertNewcomer,
  ApiError,
  api,
  searchMembers,
  searchPriests,
} from "@/lib/api";

type SponsorshipFormState = {
  sponsor_member_id: string;
  beneficiary_member_id: string;
  newcomer_id: string;
  beneficiary_name: string;
  father_of_repentance_id: string;
  monthly_amount: string;
  start_date: string;
  frequency: "OneTime" | "Monthly" | "Quarterly" | "Yearly";
  program: SponsorshipProgram;
  pledge_channel: SponsorshipPledgeChannel;
  reminder_channel: SponsorshipReminderChannel;
  motivation: SponsorshipMotivation;
  notes_template: SponsorshipNotesTemplate | "";
  notes: string;
  volunteer_services: string[];
  volunteer_service_other: string;
  payment_information: string;
  budget_month: string;
  budget_year: string;
  budget_month_year: string;
  budget_slots: string;
};

type NewcomerFormState = {
  first_name: string;
  last_name: string;
  contact_phone: string;
  contact_email: string;
  arrival_date: string;
  service_type: string;
  notes: string;
};

type ConvertFormState = {
  phone: string;
  email: string;
  status: string;
  notes: string;
};

const STATUS_ORDER: Array<Newcomer["status"]> = ["New", "InProgress", "Sponsored", "Converted", "Closed"];
const FREQUENCIES: SponsorshipFormState["frequency"][] = ["Monthly", "Quarterly", "Yearly", "OneTime"];
const PROGRAM_OPTIONS: Array<{ value: SponsorshipProgram; label: string; description: string }> = [
  { value: "Education", label: "Education", description: "Scholarships, tutoring, youth enrichment." },
  { value: "Nutrition", label: "Nutrition", description: "Groceries, meal stipends, pantry support." },
  { value: "Healthcare", label: "Healthcare", description: "Clinic visits, medication, wellness aid." },
  { value: "Housing", label: "Housing", description: "Rent, utilities, bedding, emergency shelter." },
  { value: "EmergencyRelief", label: "Emergency relief", description: "Rapid response for crises and disasters." },
  { value: "SpecialProjects", label: "Special projects", description: "Pilgrimages, seasonal drives, one-offs." },
  { value: "Youth Scholarship", label: "Youth scholarship", description: "Youth-only scholarships and mentoring." },
];
const PLEDGE_CHANNELS: Array<{
  value: SponsorshipPledgeChannel;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "InPerson", label: "In person", description: "Recorded during a visit or meeting.", icon: Handshake },
  { value: "OnlinePortal", label: "Online portal", description: "Submitted via the parish site or app.", icon: Globe },
  { value: "Phone", label: "Phone call", description: "Documented after a phone conversation.", icon: PhoneCall },
  { value: "EventBooth", label: "Event booth", description: "Collected at an outreach or fundraiser.", icon: Megaphone },
];
const REMINDER_CHANNELS: Array<{
  value: SponsorshipReminderChannel;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: "Email", label: "Email", description: "Send the monthly digest email.", icon: Mail },
  { value: "SMS", label: "SMS", description: "Short text nudges with pledge summary.", icon: MessageCircle },
  { value: "Phone", label: "Phone", description: "Logged phone call reminder.", icon: PhoneCall },
  { value: "WhatsApp", label: "WhatsApp", description: "Chat reminder for sponsors abroad.", icon: MessageCircle },
];
const MOTIVATION_OPTIONS: Array<{ value: SponsorshipMotivation; label: string; description: string }> = [
  { value: "ParishInitiative", label: "Parish initiative", description: "Campaign-driven pledge." },
  { value: "HonorMemorial", label: "Honor / memorial", description: "Gift made in someone's name." },
  { value: "CommunityOutreach", label: "Community outreach", description: "Neighbourhood or civic effort." },
  { value: "Corporate", label: "Corporate / business", description: "Company, workplace, or foundation." },
  { value: "Other", label: "Other", description: "Custom reason (document in notes)." },
];
const NOTE_TEMPLATES: Array<{ value: SponsorshipNotesTemplate; label: string; body: string }> = [
  {
    value: "FollowUp",
    label: "Follow-up",
    body: "Checked in with sponsor about pledge progression and captured the agreed next step.",
  },
  {
    value: "PaymentIssue",
    label: "Payment issue",
    body: "Sponsor reported a payment issue; coordinated with Finance to resolve before the next due date.",
  },
  {
    value: "Gratitude",
    label: "Gratitude",
    body: "Sent gratitude update highlighting the beneficiary impact and upcoming parish gathering.",
  },
  {
    value: "Escalation",
    label: "Escalation",
    body: "Escalated to PR leadership due to prolonged lapse; awaiting guidance on next contact.",
  },
];

const VOLUNTEER_OPTIONS = ["Holy Day Cleanup", "General Service", "Meal Support"];
const WIZARD_STEPS = ["Basics", "Program & Channels", "Budget & Review"];
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
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => {
  const year = CURRENT_YEAR + index;
  return { value: String(year), label: String(year) };
});

function getDefaultSponsorshipForm(): SponsorshipFormState {
  return {
    sponsor_member_id: "",
    beneficiary_member_id: "",
    newcomer_id: "",
    beneficiary_name: "",
    father_of_repentance_id: "",
    monthly_amount: "150",
    start_date: new Date().toISOString().slice(0, 10),
    frequency: "Monthly",
    program: "Housing",
    pledge_channel: "InPerson",
    reminder_channel: "Email",
    motivation: "ParishInitiative",
    notes_template: "",
    notes: "",
    volunteer_services: [],
    volunteer_service_other: "",
    payment_information: "",
    budget_month: "",
    budget_year: "",
    budget_month_year: "",
    budget_slots: "",
  };
}

const PAGE_SIZE = 10;
const DEFAULT_FILTERS = {
  status: "Active",
  program: "",
  frequency: "",
  hasNewcomer: "",
  q: "",
  startDate: "",
  endDate: "",
  page: 1,
};

export default function SponsorshipWorkspace() {
  const permissions = usePermissions();
  const toast = useToast();
  const [sponsorships, setSponsorships] = useState<SponsorshipListResponse | null>(null);
  const [sponsorshipLoading, setSponsorshipLoading] = useState(false);
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [draftFilters, setDraftFilters] = useState(filters);
  const [metrics, setMetrics] = useState<SponsorshipMetrics | null>(null);
  const [newcomers, setNewcomers] = useState<NewcomerListResponse | null>(null);
  const [newcomerLoading, setNewcomerLoading] = useState(false);
  const [showSponsorshipForm, setShowSponsorshipForm] = useState(false);
  const [showNewcomerForm, setShowNewcomerForm] = useState(false);
  const [convertTarget, setConvertTarget] = useState<Newcomer | null>(null);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [sponsorResults, setSponsorResults] = useState<Member[]>([]);
  const [sponsorLookupLoading, setSponsorLookupLoading] = useState(false);
  const [sponsorshipForm, setSponsorshipForm] = useState<SponsorshipFormState>(getDefaultSponsorshipForm);
  const [newcomerForm, setNewcomerForm] = useState<NewcomerFormState>({
    first_name: "",
    last_name: "",
    contact_phone: "",
    contact_email: "",
    arrival_date: new Date().toISOString().slice(0, 10),
    service_type: "Family Settlement",
    notes: "",
  });
  const [convertForm, setConvertForm] = useState<ConvertFormState>({ phone: "", email: "", status: "Pending", notes: "" });
  const [wizardStep, setWizardStep] = useState(0);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [selectedSponsorship, setSelectedSponsorship] = useState<Sponsorship | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<Member | null>(null);
  const [customVolunteerOptions, setCustomVolunteerOptions] = useState<string[]>([]);
  const [sponsorError, setSponsorError] = useState<string | null>(null);
  const [sponsorDetail, setSponsorDetail] = useState<MemberDetail | null>(null);
  const [sponsorDetailLoading, setSponsorDetailLoading] = useState(false);
  const [autoFatherLocked, setAutoFatherLocked] = useState(false);
  const [priestOptions, setPriestOptions] = useState<Priest[]>([]);
  const [priestLoading, setPriestLoading] = useState(false);
  const [priestQuery, setPriestQuery] = useState("");
  const resetSponsorshipForm = () => {
    setSponsorshipForm(getDefaultSponsorshipForm());
    setSponsorSearch("");
    setSponsorResults([]);
    setSelectedSponsor(null);
    setCustomVolunteerOptions([]);
    setSponsorError(null);
    setSponsorDetail(null);
    setAutoFatherLocked(false);
    setSponsorDetailLoading(false);
    setPriestQuery("");
  };
  const handleCloseSponsorshipModal = () => {
    setShowSponsorshipForm(false);
    resetSponsorshipForm();
    setWizardStep(0);
  };

  const canViewBoard = permissions.viewSponsorships || permissions.manageSponsorships;
  const canViewNewcomers = permissions.viewNewcomers || permissions.manageNewcomers;

  useEffect(() => {
    if (filterDrawerOpen) {
      setDraftFilters(filters);
    }
  }, [filterDrawerOpen, filters]);

  useEffect(() => {
    if (!canViewBoard) return;
    const run = async () => {
      setSponsorshipLoading(true);
      try {
        const data = await listSponsorships({
          status: filters.status || undefined,
          program: filters.program || undefined,
          frequency: filters.frequency || undefined,
          has_newcomer: filters.hasNewcomer === "" ? undefined : filters.hasNewcomer === "yes",
          q: filters.q || undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined,
          page: filters.page,
          page_size: PAGE_SIZE,
        });
        setSponsorships(data);
      } catch (error) {
        console.error(error);
        toast.push("Unable to load sponsorships right now.");
      } finally {
        setSponsorshipLoading(false);
      }
    };
    run();
  }, [filters, canViewBoard, toast]);

  useEffect(() => {
    if (!canViewBoard) return;
    getSponsorshipMetrics()
      .then(setMetrics)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to load sponsorship metrics.");
      });
  }, [canViewBoard, toast]);

  useEffect(() => {
    if (!canViewNewcomers) return;
    const run = async () => {
      setNewcomerLoading(true);
      try {
        const data = await listNewcomers({ page: 1, page_size: 40 });
        setNewcomers(data);
      } catch (error) {
        console.error(error);
        toast.push("Unable to load newcomer pipeline.");
      } finally {
        setNewcomerLoading(false);
      }
    };
    run();
  }, [canViewNewcomers, toast]);

  useEffect(() => {
    if (!showSponsorshipForm) {
      setWizardStep(0);
    }
  }, [showSponsorshipForm]);

  useEffect(() => {
    if (sponsorSearch.trim().length < 2) {
      setSponsorResults([]);
      return;
    }
    let cancelled = false;
    setSponsorLookupLoading(true);
    searchMembers(sponsorSearch.trim(), 5)
      .then((results) => {
        if (!cancelled) {
          setSponsorResults(results);
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) {
          setSponsorLookupLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sponsorSearch]);

  useEffect(() => {
    let cancelled = false;
    setPriestLoading(true);
    searchPriests("", 50)
      .then((list) => {
        if (!cancelled) {
          setPriestOptions(list);
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (!cancelled) {
          setPriestLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const sponsorId = Number(sponsorshipForm.sponsor_member_id);
    if (!sponsorId || Number.isNaN(sponsorId)) {
      setSponsorDetail(null);
      if (!sponsorshipForm.sponsor_member_id) {
        setSponsorError(null);
      }
      setAutoFatherLocked(false);
      setPriestQuery("");
      return;
    }
    let cancelled = false;
    setSponsorDetailLoading(true);
    api<MemberDetail>(`/members/${sponsorId}`)
      .then((detail) => {
        if (cancelled) return;
        if (detail.id !== sponsorId) return;
        setSponsorDetail(detail);
        setSelectedSponsor(detail);
        setSponsorSearch(`${detail.first_name} ${detail.last_name}`.trim());
        if (detail.status !== "Active") {
          setSponsorError("Sponsor must be marked Active before they can fund a sponsorship.");
        } else {
          setSponsorError(null);
        }
        if (detail.father_confessor) {
          setAutoFatherLocked(true);
          setSponsorshipForm((prev) => ({
            ...prev,
            father_of_repentance_id: String(detail.father_confessor?.id ?? ""),
          }));
          setPriestQuery(detail.father_confessor.full_name ?? "");
        } else {
          setAutoFatherLocked(false);
          setPriestQuery("");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setSponsorDetail(null);
      })
      .finally(() => {
        if (!cancelled) {
          setSponsorDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sponsorshipForm.sponsor_member_id]);

  const groupedNewcomers = useMemo(() => {
    const map: Record<Newcomer["status"], Newcomer[]> = {
      New: [],
      InProgress: [],
      Sponsored: [],
      Converted: [],
      Closed: [],
    };
    newcomers?.items.forEach((item) => {
      map[item.status]?.push(item);
    });
    return map;
  }, [newcomers]);

  const combinedVolunteerOptions = useMemo(() => {
    const deduped = new Map<string, string>();
    VOLUNTEER_OPTIONS.forEach((option) => deduped.set(option.toLowerCase(), option));
    customVolunteerOptions.forEach((option) => {
      const key = option.toLowerCase();
      if (!deduped.has(key)) {
        deduped.set(key, option);
      }
    });
    return Array.from(deduped.values());
  }, [customVolunteerOptions]);

  const volunteerSuggestions = useMemo(() => {
    const value = sponsorshipForm.volunteer_service_other.trim().toLowerCase();
    if (!value || value.length < 2) return [];
    return combinedVolunteerOptions
      .filter((option) => option.toLowerCase().includes(value) && option.toLowerCase() !== value)
      .slice(0, 4);
  }, [combinedVolunteerOptions, sponsorshipForm.volunteer_service_other]);

  const filteredPriests = useMemo(() => {
    if (!priestQuery.trim()) {
      return priestOptions.slice(0, 6);
    }
    const term = priestQuery.trim().toLowerCase();
    return priestOptions.filter((priest) => priest.full_name.toLowerCase().includes(term));
  }, [priestOptions, priestQuery]);

  const selectedFatherName =
    priestQuery ||
    priestOptions.find((priest) => String(priest.id) === sponsorshipForm.father_of_repentance_id)?.full_name ||
    "";

  const selectedBudgetMonthLabel =
    MONTH_OPTIONS.find((option) => option.value === sponsorshipForm.budget_month)?.label ?? "";

  const toggleVolunteerService = (service: string) => {
    setSponsorshipForm((prev) => {
      const exists = prev.volunteer_services.includes(service);
      return {
        ...prev,
        volunteer_services: exists
          ? prev.volunteer_services.filter((item) => item !== service)
          : [...prev.volunteer_services, service],
      };
    });
  };

  const handleVolunteerSuggestionApply = (service: string) => {
    toggleVolunteerService(service);
    setSponsorshipForm((prev) => ({ ...prev, volunteer_service_other: "" }));
  };

  const handleBudgetMonthSelect = (monthValue: string) => {
    setSponsorshipForm((prev) => {
      const nextMonth = prev.budget_month === monthValue ? "" : monthValue;
      return {
        ...prev,
        budget_month: nextMonth,
        budget_month_year: formatBudgetMonthYear(nextMonth, prev.budget_year),
      };
    });
  };

  const handlePriestSelect = (priest: Priest) => {
    setSponsorshipForm((prev) => ({
      ...prev,
      father_of_repentance_id: String(priest.id),
    }));
    setPriestQuery(priest.full_name);
  };

  const handleClearFather = () => {
    if (autoFatherLocked) return;
    setSponsorshipForm((prev) => ({ ...prev, father_of_repentance_id: "" }));
    setPriestQuery("");
  };

  const reloadNewcomers = () => {
    if (!canViewNewcomers) return;
    setNewcomerLoading(true);
    listNewcomers({ page: 1, page_size: 40 })
      .then(setNewcomers)
      .catch((error) => {
        console.error(error);
        toast.push("Unable to refresh newcomers.");
      })
      .finally(() => setNewcomerLoading(false));
  };

  const handleSponsorSelect = (member: Member) => {
    setSelectedSponsor(member);
    setSponsorDetail(null);
    setSponsorshipForm((prev) => ({
      ...prev,
      sponsor_member_id: String(member.id),
    }));
    setSponsorError(null);
    setAutoFatherLocked(false);
    setPriestQuery("");
    setSponsorSearch(`${member.first_name} ${member.last_name}`);
    setSponsorResults([]);
  };

  const handleAddCustomVolunteer = () => {
    const value = sponsorshipForm.volunteer_service_other.trim();
    if (!value) {
      toast.push("Enter a service name first.");
      return;
    }
    const normalized = value.toLowerCase();
    const existsInOptions = combinedVolunteerOptions.some(
      (option) => option.toLowerCase() === normalized,
    );
    const existsInSelection = sponsorshipForm.volunteer_services.some(
      (option) => option.toLowerCase() === normalized,
    );
    if (existsInOptions) {
      toast.push(`"${value}" already exists—tap its chip instead.`);
      return;
    }
    if (existsInSelection) {
      toast.push("Service already added.");
      return;
    }
    setCustomVolunteerOptions((prev) => [...prev, value]);
    toggleVolunteerService(value);
    setSponsorshipForm((prev) => ({ ...prev, volunteer_service_other: "" }));
  };

  const handleNewcomerPhoneChange = (value: string) => {
    setNewcomerForm((prev) => ({ ...prev, contact_phone: value }));
  };

  const handleConvertPhoneChange = (value: string) => {
    setConvertForm((prev) => ({ ...prev, phone: value }));
  };

  const handleFilterApply = () => {
    setFilters({ ...draftFilters, page: 1 });
    setFilterDrawerOpen(false);
  };

const handleFilterReset = () => {
  const reset = { ...DEFAULT_FILTERS };
  setDraftFilters(reset);
  setFilters(reset);
  setFilterDrawerOpen(false);
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (error.body) {
      try {
        const parsed = JSON.parse(error.body);
        if (parsed && typeof parsed === "object" && "detail" in parsed) {
          return String(parsed.detail);
        }
      } catch {
        // ignore parse issue, fall back to plain text
      }
      return error.body;
    }
    return fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

  const handleNotesTemplateApply = (value: SponsorshipNotesTemplate) => {
    setSponsorshipForm((prev) => {
      if (prev.notes_template === value) {
        return { ...prev, notes_template: "", notes: prev.notes };
      }
      const template = NOTE_TEMPLATES.find((item) => item.value === value);
      return { ...prev, notes_template: value, notes: template?.body ?? prev.notes };
    });
  };

  const handleSponsorshipSubmit = async () => {
    if (!validateWizardStep(2)) {
      setWizardStep(2);
      return;
    }
    if (!sponsorshipForm.sponsor_member_id) {
      toast.push("Select a sponsor before saving.");
      setWizardStep(0);
      return;
    }
    const sponsorId = Number(sponsorshipForm.sponsor_member_id);
    if (!sponsorId || Number.isNaN(sponsorId)) {
      toast.push("Sponsor ID is required.");
      setWizardStep(0);
      return;
    }
    const beneficiaryId = sponsorshipForm.beneficiary_member_id ? Number(sponsorshipForm.beneficiary_member_id) : undefined;
    const newcomerId = sponsorshipForm.newcomer_id ? Number(sponsorshipForm.newcomer_id) : undefined;
    const monthlyAmount = Number(sponsorshipForm.monthly_amount);
    const budgetMonth = sponsorshipForm.budget_month ? Number(sponsorshipForm.budget_month) : undefined;
    const budgetYear = sponsorshipForm.budget_year ? Number(sponsorshipForm.budget_year) : undefined;
    const budgetSlots = sponsorshipForm.budget_slots ? Number(sponsorshipForm.budget_slots) : undefined;
    const volunteerServices = sponsorshipForm.volunteer_services.length ? sponsorshipForm.volunteer_services : undefined;
    const fatherId = sponsorshipForm.father_of_repentance_id
      ? Number(sponsorshipForm.father_of_repentance_id)
      : undefined;
    try {
      await createSponsorship({
        sponsor_member_id: sponsorId,
        beneficiary_member_id: beneficiaryId || undefined,
        newcomer_id: newcomerId || undefined,
        beneficiary_name: sponsorshipForm.beneficiary_name || undefined,
        father_of_repentance_id: fatherId,
        monthly_amount: monthlyAmount,
        start_date: sponsorshipForm.start_date,
        frequency: sponsorshipForm.frequency,
        status: "Active",
        program: sponsorshipForm.program,
        pledge_channel: sponsorshipForm.pledge_channel,
        reminder_channel: sponsorshipForm.reminder_channel,
        motivation: sponsorshipForm.motivation,
        volunteer_services: volunteerServices,
        volunteer_service_other: sponsorshipForm.volunteer_service_other || undefined,
        payment_information: sponsorshipForm.payment_information || undefined,
        budget_month: budgetMonth,
        budget_year: budgetYear,
        budget_slots: budgetSlots,
        notes_template: sponsorshipForm.notes_template || undefined,
        notes: sponsorshipForm.notes || undefined,
      });
      toast.push("Sponsorship saved.");
      setFilters((prev) => ({ ...prev }));
      handleCloseSponsorshipModal();
    } catch (error) {
      console.error(error);
      const friendly = getErrorMessage(error, "Could not create sponsorship.");
      if (friendly.toLowerCase().includes("sponsor must")) {
        setSponsorError(friendly);
        setWizardStep(0);
      }
      toast.push(friendly);
    }
  };

  const handleNewcomerSubmit = async () => {
    if (!newcomerForm.contact_phone && !newcomerForm.contact_email) {
      toast.push("Provide at least a phone or email.");
      return;
    }
    try {
      await createNewcomer({
        first_name: newcomerForm.first_name.trim(),
        last_name: newcomerForm.last_name.trim(),
        contact_phone: newcomerForm.contact_phone || undefined,
        contact_email: newcomerForm.contact_email || undefined,
        arrival_date: newcomerForm.arrival_date,
        service_type: newcomerForm.service_type || undefined,
        notes: newcomerForm.notes || undefined,
        status: "New",
      });
      toast.push("Newcomer registered.");
      setShowNewcomerForm(false);
      setNewcomers(null);
      reloadNewcomers();
    } catch (error) {
      console.error(error);
      toast.push("Could not save newcomer.");
    }
  };

  const handleConvertSubmit = async () => {
    if (!convertTarget) return;
    try {
      await convertNewcomer(convertTarget.id, {
        phone: convertForm.phone || undefined,
        email: convertForm.email || undefined,
        status: convertForm.status || undefined,
        notes: convertForm.notes || undefined,
      });
      toast.push("Newcomer converted to member.");
      setConvertTarget(null);
      reloadNewcomers();
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push("Conversion failed.");
    }
  };

  const handleAdvanceStatus = async (record: Newcomer, nextStatus: Newcomer["status"]) => {
    try {
      await updateNewcomer(record.id, { status: nextStatus });
      toast.push(`Marked newcomer as ${nextStatus}.`);
      reloadNewcomers();
    } catch (error) {
      console.error(error);
      toast.push("Unable to update newcomer.");
    }
  };

  const handleRemind = async (id: number) => {
    try {
      await remindSponsorship(id);
      toast.push("Reminder queued.");
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error(error);
      toast.push(getErrorMessage(error, "Failed to trigger reminder."));
    }
  };

  const validateWizardStep = (step: number, options: { silent?: boolean } = {}): boolean => {
    const notify = (message: string) => {
      if (!options.silent) {
        toast.push(message);
      }
    };
    const currentSponsorStatus = sponsorDetail?.status ?? selectedSponsor?.status;
    if (step === 0) {
      if (!sponsorshipForm.sponsor_member_id) {
        const message = "Select a sponsor before continuing.";
        setSponsorError(message);
        notify(message);
        return false;
      }
      if (currentSponsorStatus && currentSponsorStatus !== "Active") {
        const message = "Sponsor must be marked Active before they can fund a sponsorship.";
        setSponsorError(message);
        notify(message);
        return false;
      }
      setSponsorError(null);
      if (!sponsorshipForm.monthly_amount || Number(sponsorshipForm.monthly_amount) <= 0) {
        notify("Monthly amount must be greater than zero.");
        return false;
      }
      if (!sponsorshipForm.start_date) {
        notify("Choose a start date.");
        return false;
      }
      if (
        !sponsorshipForm.beneficiary_member_id &&
        !sponsorshipForm.newcomer_id &&
        !sponsorshipForm.beneficiary_name.trim()
      ) {
        notify("Provide a beneficiary member, newcomer, or fallback name.");
        return false;
      }
    }
    if (step === 1) {
      if (!sponsorshipForm.program) {
        notify("Select a sponsorship program.");
        return false;
      }
      if (!sponsorshipForm.pledge_channel) {
        notify("Select a pledge channel.");
        return false;
      }
      if (!sponsorshipForm.reminder_channel) {
        notify("Select a reminder channel.");
        return false;
      }
    }
    if (step === 2) {
      if (
        (sponsorshipForm.budget_month && !sponsorshipForm.budget_year) ||
        (!sponsorshipForm.budget_month && sponsorshipForm.budget_year)
      ) {
        notify("Provide both budget month and year, or leave both blank.");
        return false;
      }
      if (sponsorshipForm.budget_slots && Number(sponsorshipForm.budget_slots) <= 0) {
        notify("Budget slots must be positive when provided.");
        return false;
      }
      if (sponsorshipForm.motivation === "Other" && !sponsorshipForm.notes.trim()) {
        notify("Add a short note when using Other motivation.");
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (validateWizardStep(wizardStep)) {
      setWizardStep((prev) => Math.min(WIZARD_STEPS.length - 1, prev + 1));
    }
  };

  if (!canViewBoard && !canViewNewcomers) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4" data-tour="sponsorship-metrics">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sponsorship Management</h1>
          <p className="text-sm text-mute">Pair sponsors with beneficiaries, track newcomer settlement, and monitor budgets.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setFilterDrawerOpen(true)}>
            <Filter className="h-4 w-4" />
            Filters
          </Button>
          <Button variant="ghost" onClick={() => setFilters((prev) => ({ ...prev }))}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
          {permissions.manageNewcomers && (
            <Button variant="ghost" onClick={() => setShowNewcomerForm(true)}>
              <PlusCircle className="h-4 w-4" />
              New newcomer
            </Button>
          )}
          {permissions.manageSponsorships && (
            <Button
              data-tour="sponsorship-wizard"
              onClick={() => {
                resetSponsorshipForm();
                setShowSponsorshipForm(true);
              }}
            >
              <HandHeart className="h-4 w-4" />
              New sponsorship
            </Button>
          )}
        </div>
      </div>

      {canViewBoard && (
        <>
          <div className="grid gap-4 md:grid-cols-4" data-tour="sponsorship-filters">
            <MetricCard
              icon={Users}
              label="Active sponsors"
              value={metrics?.total_active_sponsors ?? sponsorships?.total ?? 0}
            />
            <MetricCard
              icon={HandHeart}
              label="Newcomers sponsored"
              value={metrics?.newcomers_sponsored ?? 0}
            />
            <MetricCard
              icon={Bell}
              label="This month's sponsorships"
              value={metrics?.month_sponsorships ?? 0}
            />
            <MetricCard
              icon={Megaphone}
              label="Budget utilization"
              value={`${metrics?.budget_utilization_percent?.toFixed(0) ?? 0}%`}
              description={
                metrics?.current_budget
                  ? `${metrics.current_budget.used_slots}/${metrics.current_budget.total_slots || 0} slots`
                  : "No budget set"
              }
            />
          </div>

          {metrics?.alerts?.length ? (
            <Card className="border-amber-300 bg-amber-50/80 text-sm text-amber-900 flex flex-wrap gap-3 p-4">
              {metrics.alerts.map((alert, index) => (
                <div key={alert} className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{alert}</span>
                </div>
              ))}
            </Card>
          ) : null}

          <Card className="p-0 overflow-hidden" data-tour="sponsorship-list">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3" data-tour="sponsorship-filters">
              <div className="flex items-center gap-3">
                <Search className="h-4 w-4 text-mute" />
                <Input
                  value={filters.q}
                  onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
                  placeholder="Search sponsors or beneficiaries…"
                />
              </div>
              <div className="flex items-center gap-2 text-xs text-mute">
                <Badge variant="outline">{filters.status || "All statuses"}</Badge>
                {filters.frequency && <Badge variant="outline">{filters.frequency}</Badge>}
                {filters.hasNewcomer && (
                  <Badge variant="outline">{filters.hasNewcomer === "yes" ? "Has newcomer" : "Members only"}</Badge>
                )}
                {(filters.startDate || filters.endDate) && (
                  <Badge variant="outline">
                    {filters.startDate || "Any"} → {filters.endDate || "Any"}
                  </Badge>
                )}
              </div>
            </div>

            {sponsorshipLoading ? (
              <div className="py-12 text-center text-mute flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sponsorships…
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-mute border-b border-border">
                    <tr>
                      <th className="py-2 px-4">Sponsor</th>
                      <th className="py-2 px-4">Frequency</th>
                      <th className="py-2 px-4">Last sponsorship</th>
                      <th className="py-2 px-4">Status</th>
                      <th className="py-2 px-4">Budget</th>
                      <th className="py-2 px-4 text-right">Outstanding</th>
                      <th className="py-2 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sponsorships?.items.map((item) => (
                      <tr
                        key={item.id}
                        className="border-b border-border/60 last:border-none hover:bg-muted/40 cursor-pointer"
                        onClick={() => {
                          setSelectedSponsorship(item);
                          setDetailOpen(true);
                        }}
                      >
                        <td className="py-3 px-4">
                          <div className="font-medium">
                            {item.sponsor.first_name} {item.sponsor.last_name}
                          </div>
                          <div className="text-xs text-mute">
                            {item.sponsor_status || "Status unknown"}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge>{item.frequency}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          {item.last_sponsored_date ? (
                            <div>
                              <div>{new Date(item.last_sponsored_date).toLocaleDateString()}</div>
                              <div className="text-xs text-mute">
                                {item.days_since_last_sponsorship ?? 0} days ago
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-mute">Never</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={
                              item.status === "Active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : item.status === "Suspended"
                                  ? "bg-rose-50 text-rose-600 border-rose-200"
                                  : "bg-muted text-foreground border-border"
                            }
                          >
                            {item.status}
                          </Badge>
                          {item.last_status === "Rejected" && item.last_status_reason && (
                            <div className="text-xs text-rose-600 mt-1">Reason: {item.last_status_reason}</div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {item.budget_slots ? (
                            <div>
                              <div className="text-xs">
                                {item.used_slots}/{item.budget_slots} sponsored
                              </div>
                              <div className="h-1.5 w-full bg-border rounded-full mt-1 overflow-hidden">
                                <div
                                  className={`h-full ${
                                    item.budget_over_capacity
                                      ? "bg-rose-500"
                                      : (item.budget_utilization_percent ?? 0) > 80
                                        ? "bg-amber-500"
                                        : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${Math.min(100, item.budget_utilization_percent ?? 0)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-mute">No capacity set</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={item.outstanding_balance > 0 ? "text-rose-600 font-semibold" : ""}>
                            {currency(item.outstanding_balance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {permissions.manageSponsorships ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRemind(item.id);
                                }}
                              >
                                <Bell className="h-4 w-4" />
                                Remind
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-mute">Read only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!sponsorships?.items.length && (
                      <tr>
                        <td className="py-8 text-center text-mute" colSpan={7}>
                          No sponsorships match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {sponsorships && sponsorships.total > sponsorships.page_size && (
              <div className="flex justify-between items-center px-4 py-3 text-sm text-mute">
                <span>
                  Page {filters.page} of {Math.ceil(sponsorships.total / sponsorships.page_size)}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    disabled={filters.page === 1}
                    onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={filters.page >= Math.ceil(sponsorships.total / sponsorships.page_size)}
                    onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {canViewNewcomers && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HandHeart className="h-8 w-8 text-accent" />
              <div>
                <p className="text-sm text-mute uppercase tracking-wide">Newcomer settlement</p>
                <p className="text-2xl font-semibold">{newcomers?.total ?? "—"}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={reloadNewcomers}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
          {newcomerLoading ? (
            <div className="py-10 text-center text-mute flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading newcomer pipeline…
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-5">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{status}</h3>
                    <Badge className="text-xs">{groupedNewcomers[status]?.length ?? 0}</Badge>
                  </div>
                  <div className="space-y-3">
                    {groupedNewcomers[status]?.map((record) => (
                      <div key={record.id} className="rounded-2xl border border-border/80 bg-card/70 p-3 space-y-2">
                        <div className="font-medium">{record.first_name} {record.last_name}</div>
                        <div className="text-xs text-mute">Arrived {new Date(record.arrival_date).toLocaleDateString()}</div>
                        {record.service_type && (
                          <div className="text-xs">{record.service_type}</div>
                        )}
                        <div className="text-xs text-mute">
                          {record.contact_phone || record.contact_email || "No contact yet"}
                        </div>
                        {permissions.manageNewcomers && status !== "Converted" && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            {status === "New" && (
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => handleAdvanceStatus(record, "InProgress")}
                              >
                                Start follow-up
                              </Button>
                            )}
                            {status === "InProgress" && (
                              <Button
                                variant="ghost"
                                className="text-xs"
                                onClick={() => handleAdvanceStatus(record, "Sponsored")}
                              >
                                Mark sponsored
                              </Button>
                            )}
                            <Button
                              variant="soft"
                              className="text-xs"
                              onClick={() => {
                                setConvertTarget(record);
                                setConvertForm({
                                  phone: record.contact_phone || "",
                                  email: record.contact_email || "",
                                  status: "Pending",
                                  notes: "",
                                });
                              }}
                            >
                              Convert
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!groupedNewcomers[status]?.length && (
                      <p className="text-xs text-mute italic">No records</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <AnimatePresence>
        {filterDrawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/50 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilterDrawerOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border shadow-soft z-50 p-6 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Filters</h2>
                  <p className="text-sm text-mute">Refine sponsorship view.</p>
                </div>
                <Button variant="ghost" onClick={() => setFilterDrawerOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Status</label>
                  <Select
                    value={draftFilters.status}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
                  >
                    <option value="Active">Active</option>
                    <option value="Suspended">Suspended</option>
                    <option value="Draft">Draft</option>
                    <option value="Completed">Completed</option>
                    <option value="">All statuses</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Program</label>
                  <Select
                    value={draftFilters.program}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, program: event.target.value }))}
                  >
                    <option value="">All programs</option>
                    {PROGRAM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Frequency</label>
                  <Select
                    value={draftFilters.frequency}
                    onChange={(event) => setDraftFilters((prev) => ({ ...prev, frequency: event.target.value }))}
                  >
                    <option value="">Any frequency</option>
                    {FREQUENCIES.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Has newcomer?</label>
                  <div className="flex gap-2">
                    {[
                      { label: "Any", value: "" },
                      { label: "Yes", value: "yes" },
                      { label: "No", value: "no" },
                    ].map((option) => {
                      const active = draftFilters.hasNewcomer === option.value;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          variant={active ? "default" : "outline"}
                          onClick={() => setDraftFilters((prev) => ({ ...prev, hasNewcomer: option.value }))}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Start date from</label>
                    <Input
                      type="date"
                      value={draftFilters.startDate}
                      onChange={(event) => setDraftFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Start date to</label>
                    <Input
                      type="date"
                      value={draftFilters.endDate}
                      onChange={(event) => setDraftFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="ghost" onClick={() => setFilterDrawerOpen(false)}>
                  Cancel
                </Button>
                <Button variant="ghost" onClick={handleFilterReset}>
                  Reset
                </Button>
                <Button onClick={handleFilterApply}>Apply</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailOpen && selectedSponsorship && (
          <>
            <motion.div
              className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDetailOpen(false)}
            />
            <motion.div
              className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-card shadow-soft border-l border-border z-50 overflow-y-auto"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
            >
              <div className="p-6 space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {selectedSponsorship.sponsor.first_name} {selectedSponsorship.sponsor.last_name}
                    </h2>
                    <p className="text-sm text-mute">{selectedSponsorship.beneficiary_name}</p>
                    {selectedSponsorship.newcomer && (
                      <Badge variant="outline" className="mt-2">
                        Linked newcomer
                      </Badge>
                    )}
                  </div>
                  <Button variant="ghost" onClick={() => setDetailOpen(false)}>
                    Close
                  </Button>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <Card className="p-4 space-y-2">
                    <p className="text-xs uppercase text-mute">Father of Repentance</p>
                    <p className="font-medium">
                      {selectedSponsorship.father_of_repentance_name || "Not set"}
                    </p>
                  </Card>
                  <Card className="p-4 space-y-2">
                    <p className="text-xs uppercase text-mute">Frequency</p>
                    <Badge>{selectedSponsorship.frequency}</Badge>
                    <p className="text-xs text-mute">Reminder via {selectedSponsorship.reminder_channel || "Email"}</p>
                  </Card>
                  <Card className="p-4 space-y-2">
                    <p className="text-xs uppercase text-mute">Volunteer service</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedSponsorship.volunteer_services.length ? (
                        selectedSponsorship.volunteer_services.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-mute">None captured</span>
                      )}
                      {selectedSponsorship.volunteer_service_other && (
                        <Badge variant="outline">{selectedSponsorship.volunteer_service_other}</Badge>
                      )}
                    </div>
                  </Card>
                </div>
                {selectedSponsorship.payment_health && (
                  <Card className="p-4 space-y-2">
                    <p className="text-xs uppercase text-mute">Payment health</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="text-sm text-mute">Monthly contribution</p>
                        <p className="font-semibold">
                          {currency(selectedSponsorship.payment_health.monthly_contribution)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-mute">Method</p>
                        <p className="font-semibold">{selectedSponsorship.payment_health.method || "Not set"}</p>
                      </div>
                      <div>
                        <p className="text-sm text-mute">Last payment</p>
                        <p className="font-semibold">
                          {selectedSponsorship.payment_health.last_payment_date
                            ? new Date(selectedSponsorship.payment_health.last_payment_date).toLocaleDateString()
                            : "Never"}
                        </p>
                        <p className="text-xs text-mute">
                          {selectedSponsorship.payment_health.days_since_last_payment ?? "—"} days ago
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          selectedSponsorship.payment_health.status === "Green"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                            : selectedSponsorship.payment_health.status === "Yellow"
                              ? "bg-amber-50 text-amber-600 border-amber-200"
                              : "bg-rose-50 text-rose-600 border-rose-200"
                        }
                      >
                        {selectedSponsorship.payment_health.status}
                      </Badge>
                    </div>
                  </Card>
                )}
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase text-mute">Budget</p>
                      {selectedSponsorship.budget_slots ? (
                        <p className="font-semibold">
                          {selectedSponsorship.used_slots}/{selectedSponsorship.budget_slots} slots used
                        </p>
                      ) : (
                        <p className="text-sm text-mute">No budget configured</p>
                      )}
                    </div>
                    {permissions.manageSponsorships && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          handleRemind(selectedSponsorship.id);
                        }}
                      >
                        <Bell className="h-4 w-4" />
                        Remind sponsor
                      </Button>
                    )}
                  </div>
                  {selectedSponsorship.budget_slots && (
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full ${
                          selectedSponsorship.budget_over_capacity
                            ? "bg-rose-500"
                            : (selectedSponsorship.budget_utilization_percent ?? 0) > 80
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{
                          width: `${Math.min(100, selectedSponsorship.budget_utilization_percent ?? 0)}%`,
                        }}
                      />
                    </div>
                  )}
                  <div className="text-xs text-mute">
                    Start {new Date(selectedSponsorship.start_date).toLocaleDateString()}
                    {selectedSponsorship.end_date ? ` • End ${new Date(selectedSponsorship.end_date).toLocaleDateString()}` : ""}
                  </div>
                </Card>
                <Card className="p-4 space-y-3">
                  <p className="text-xs uppercase text-mute">Timeline</p>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm font-medium">Last status</p>
                      <p className="text-sm text-mute">
                        {selectedSponsorship.last_status || "Pending"}
                        {selectedSponsorship.last_status_reason ? ` – ${selectedSponsorship.last_status_reason}` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Reminder cadence</p>
                      <p className="text-sm text-mute">
                        Next reminder {selectedSponsorship.reminder_next_due ? new Date(selectedSponsorship.reminder_next_due).toLocaleDateString() : "not scheduled"}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>


<AnimatePresence>
  {showSponsorshipForm && (
    <>
      <motion.div
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleCloseSponsorshipModal}
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
            <p className="text-xs uppercase text-mute">Step {wizardStep + 1} of {WIZARD_STEPS.length}</p>
            <h2 className="text-xl font-semibold">New sponsorship</h2>
          </div>
          <Button variant="ghost" onClick={handleCloseSponsorshipModal}>
            Close
          </Button>
        </div>
        <div className="px-6 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            {WIZARD_STEPS.map((label, index) => (
              <div key={label} className="flex items-center gap-2 flex-1 min-w-[80px]">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center text-sm ${index <= wizardStep ? "bg-accent text-white" : "bg-muted text-mute"}`}
                >
                  {index + 1}
                </div>
                <span className={`text-xs md:text-sm ${index === wizardStep ? "font-semibold" : "text-mute"}`}>
                  {label}
                </span>
                {index < WIZARD_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${index < wizardStep ? "bg-accent" : "bg-border"}`} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {wizardStep === 0 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Sponsor search</label>
                      <Input
                        placeholder="Search by name"
                        value={sponsorSearch}
                        onChange={(event) => {
                          setSelectedSponsor(null);
                          setSponsorSearch(event.target.value);
                        }}
                      />
                {sponsorLookupLoading ? (
                  <div className="text-xs text-mute mt-1">Searching…</div>
                ) : (
                  sponsorResults.length > 0 && (
                    <ul className="mt-2 border border-border rounded-xl divide-y divide-border/60">
                      {sponsorResults.map((result) => (
                        <li
                          key={result.id}
                          className="px-3 py-2 text-sm hover:bg-accent/10 cursor-pointer flex items-center justify-between gap-3"
                          onClick={() => handleSponsorSelect(result)}
                        >
                          <div>
                            {result.first_name} {result.last_name}
                            <span className="text-xs text-mute ml-2">#{result.id}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              result.status === "Active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }
                          >
                            {result.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )
                )}
              </div>
              {selectedSponsor && (
                <Card className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      {selectedSponsor.first_name} {selectedSponsor.last_name}
                    </p>
                    <p className="text-xs text-mute">
                      {selectedSponsor.email || "No email"} • {selectedSponsor.phone || "No phone"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      selectedSponsor.status === "Active"
                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                        : "bg-amber-50 text-amber-600 border-amber-200"
                    }
                  >
                    {selectedSponsor.status}
                  </Badge>
                </Card>
              )}
              {sponsorDetailLoading && (
                <p className="text-xs text-mute">Syncing membership profile…</p>
              )}
              {selectedSponsor && selectedSponsor.status !== "Active" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 text-xs text-amber-900 p-3">
                  Sponsor status is {selectedSponsor.status}. Only active members can fund sponsorships—confirm their status
                  in Membership or select a different sponsor.
                </div>
              )}
              {sponsorError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/80 text-xs text-rose-800 p-3 flex gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <div>
                    <p>{sponsorError}</p>
                    <p className="mt-1 text-[11px] text-rose-700/80">
                      Update their record in Membership or choose another sponsor.
                    </p>
                  </div>
                </div>
              )}
              {sponsorshipForm.sponsor_member_id && (
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Father of Repentance</label>
                  {autoFatherLocked ? (
                    <>
                      <Input value={selectedFatherName || "Synced from membership"} disabled />
                      <p className="text-xs text-mute mt-1">
                        This sponsor already has a Father of Repentance in Membership. Update their profile to change it.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Search priests"
                          value={priestQuery}
                          onChange={(event) => setPriestQuery(event.target.value)}
                        />
                        {sponsorshipForm.father_of_repentance_id && (
                          <Button type="button" variant="ghost" onClick={handleClearFather}>
                            Clear
                          </Button>
                        )}
                      </div>
                      <div className="mt-2 border border-border rounded-2xl max-h-40 overflow-y-auto">
                        {filteredPriests.length ? (
                          <ul className="divide-y divide-border/60">
                            {filteredPriests.slice(0, 6).map((priest) => (
                              <li key={priest.id}>
                                <button
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                                    String(priest.id) === sponsorshipForm.father_of_repentance_id
                                      ? "bg-accent/10"
                                      : "hover:bg-muted/60"
                                  }`}
                                  onClick={() => handlePriestSelect(priest)}
                                >
                                  <span>{priest.full_name}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {priest.status}
                                  </Badge>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-mute px-3 py-2">
                            {priestLoading ? "Loading priests…" : "No matching priests"}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Sponsor ID</label>
                        <Input
                          type="number"
                          value={sponsorshipForm.sponsor_member_id}
                          onChange={(event) => {
                            setSelectedSponsor(null);
                            setSponsorshipForm((prev) => ({ ...prev, sponsor_member_id: event.target.value }));
                          }}
                        />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Beneficiary member ID</label>
                  <Input
                    type="number"
                    value={sponsorshipForm.beneficiary_member_id}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, beneficiary_member_id: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Link newcomer</label>
                <Select
                  value={sponsorshipForm.newcomer_id}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, newcomer_id: event.target.value }))
                  }
                >
                  <option value="">Select newcomer</option>
                  {newcomers?.items
                    .filter((item) => item.status !== "Converted")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.first_name} {item.last_name}
                      </option>
                    ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Beneficiary name (fallback)</label>
                <Input
                  value={sponsorshipForm.beneficiary_name}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, beneficiary_name: event.target.value }))
                  }
                  placeholder="Family or newcomer name"
                />
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Monthly amount (CAD)</label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={sponsorshipForm.monthly_amount}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, monthly_amount: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Start date</label>
                  <Input
                    type="date"
                    value={sponsorshipForm.start_date}
                    onChange={(event) =>
                      setSponsorshipForm((prev) => ({ ...prev, start_date: event.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {wizardStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Frequency</label>
                <div className="flex flex-wrap gap-2">
                  {FREQUENCIES.map((frequency) => (
                    <ChipButton
                      key={frequency}
                      label={frequency}
                      active={sponsorshipForm.frequency === frequency}
                      onClick={() => setSponsorshipForm((prev) => ({ ...prev, frequency }))}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Program</label>
                <Select
                  value={sponsorshipForm.program}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, program: event.target.value as SponsorshipProgram }))
                  }
                >
                  {PROGRAM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-2">Pledge channel</label>
                <div className="grid md:grid-cols-2 gap-3">
                      {PLEDGE_CHANNELS.map((channel) => {
                        const active = sponsorshipForm.pledge_channel === channel.value;
                        const Icon = channel.icon;
                        return (
                          <button
                            key={channel.value}
                            type="button"
                            className={`rounded-2xl border p-3 text-left flex items-center gap-3 ${
                              active ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"
                            }`}
                            onClick={() =>
                              setSponsorshipForm((prev) => ({ ...prev, pledge_channel: channel.value }))
                        }
                      >
                        <Icon className="h-5 w-5 text-accent" />
                        <div>
                          <div className="font-medium text-sm">{channel.label}</div>
                          <div className="text-xs text-mute">{channel.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-2">Reminder channel</label>
                <div className="grid md:grid-cols-2 gap-3">
                      {REMINDER_CHANNELS.map((channel) => {
                        const active = sponsorshipForm.reminder_channel === channel.value;
                        const Icon = channel.icon;
                        return (
                          <button
                            key={channel.value}
                            type="button"
                            className={`rounded-2xl border p-3 text-left flex items-center gap-3 ${
                              active ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"
                            }`}
                        onClick={() =>
                          setSponsorshipForm((prev) => ({ ...prev, reminder_channel: channel.value }))
                        }
                      >
                        <Icon className="h-5 w-5 text-accent" />
                        <div>
                          <div className="font-medium text-sm">{channel.label}</div>
                          <div className="text-xs text-mute">{channel.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Motivation</label>
                <Select
                  value={sponsorshipForm.motivation}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({
                      ...prev,
                      motivation: event.target.value as SponsorshipMotivation,
                    }))
                  }
                >
                  {MOTIVATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Volunteer service</label>
                <div className="flex flex-wrap gap-2">
                  {combinedVolunteerOptions.map((option) => {
                    const active = sponsorshipForm.volunteer_services.includes(option);
                    return (
                      <ChipButton
                        key={option}
                        label={option}
                        active={active}
                        className={!VOLUNTEER_OPTIONS.includes(option) ? "border-dashed" : undefined}
                        onClick={() => toggleVolunteerService(option)}
                      />
                    );
                  })}
                </div>
                <Input
                  className="mt-2"
                  placeholder="Other service"
                  value={sponsorshipForm.volunteer_service_other}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, volunteer_service_other: event.target.value }))
                  }
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button type="button" variant="outline" onClick={handleAddCustomVolunteer}>
                    Add custom service
                  </Button>
                </div>
                {(() => {
                  const value = sponsorshipForm.volunteer_service_other.trim();
                  if (!value) return null;
                  const existingChip = combinedVolunteerOptions.find(
                    (name) => name.toLowerCase() === value.toLowerCase(),
                  );
                  if (existingChip) {
                    return (
                      <p className="text-xs text-amber-600 mt-2">
                        Looks like "{existingChip}" already exists—tap it above to select.
                      </p>
                    );
                  }
                  return null;
                })()}
                {volunteerSuggestions.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                    <span className="text-mute">Suggestions:</span>
                    {volunteerSuggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="rounded-full border border-dashed px-2 py-0.5 hover:border-accent transition"
                        onClick={() => handleVolunteerSuggestionApply(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Payment information (optional)</label>
                <Input
                  value={sponsorshipForm.payment_information}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, payment_information: event.target.value }))
                  }
                  placeholder="E.g., linked to membership contribution"
                />
              </div>
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2 space-y-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Planning month (calendar)</label>
                    <Input
                      type="month"
                      value={sponsorshipForm.budget_month_year}
                      onChange={(event) => {
                        const value = event.target.value;
                        const [year, month] = value.split("-");
                        setSponsorshipForm((prev) => ({
                          ...prev,
                          budget_month_year: value,
                          budget_month: month ?? "",
                          budget_year: year ?? "",
                        }));
                      }}
                    />
                    <p className="text-xs text-mute mt-1">Use your browser picker to lock the exact month and fiscal year.</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-mute mb-1">Quick month shortcuts</p>
                    <div className="grid grid-cols-3 gap-2">
                      {MONTH_OPTIONS.map((option) => (
                        <ChipButton
                          key={option.value}
                          label={option.label.slice(0, 3)}
                          active={sponsorshipForm.budget_month === option.value}
                          className="justify-center text-xs font-semibold"
                          onClick={() => handleBudgetMonthSelect(option.value)}
                        />
                      ))}
                    </div>
                    {selectedBudgetMonthLabel && (
                      <p className="text-xs text-mute mt-1">
                        Selected: {selectedBudgetMonthLabel}{" "}
                        {sponsorshipForm.budget_year || "(choose a year to finalize)"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Budget year</label>
                    <Select
                      value={sponsorshipForm.budget_year}
                      onChange={(event) =>
                        setSponsorshipForm((prev) => {
                          const nextYear = event.target.value;
                          return {
                            ...prev,
                            budget_year: nextYear,
                            budget_month_year: formatBudgetMonthYear(prev.budget_month, nextYear),
                          };
                        })
                      }
                    >
                      <option value="">Select year</option>
                      {YEAR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-mute mt-1">Needed for utilization + budget reports.</p>
                  </div>
                  <div>
                    <label className="text-xs uppercase text-mute block mb-1">Capacity (slots)</label>
                    <Input
                      type="number"
                      min="1"
                      value={sponsorshipForm.budget_slots}
                      onChange={(event) =>
                        setSponsorshipForm((prev) => ({ ...prev, budget_slots: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes template</label>
                <div className="flex flex-wrap gap-2">
                  {NOTE_TEMPLATES.map((template) => {
                    const active = sponsorshipForm.notes_template === template.value;
                    return (
                      <Button
                        key={template.value}
                        type="button"
                        variant={active ? "default" : "outline"}
                        className="text-xs"
                        onClick={() => handleNotesTemplateApply(template.value)}
                      >
                        {template.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  placeholder="Document stewardship context, reminders, or special handling."
                  value={sponsorshipForm.notes}
                  onChange={(event) =>
                    setSponsorshipForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
                {sponsorshipForm.motivation === "Other" && (
                  <p className="text-xs text-amber-700 mt-1">A short note is required when choosing Other.</p>
                )}
              </div>
                    <Card className="p-4 space-y-2">
                      <p className="text-xs uppercase text-mute">Review</p>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-mute">Sponsor</p>
                          <p className="font-medium">
                            {selectedSponsor
                              ? `${selectedSponsor.first_name} ${selectedSponsor.last_name} (#${selectedSponsor.id})`
                              : sponsorshipForm.sponsor_member_id
                                ? `Member #${sponsorshipForm.sponsor_member_id}`
                                : "Not selected"}
                          </p>
                        </div>
                  <div>
                    <p className="text-xs text-mute">Beneficiary</p>
                    <p className="font-medium">
                      {sponsorshipForm.beneficiary_member_id
                        ? `Member #${sponsorshipForm.beneficiary_member_id}`
                        : sponsorshipForm.beneficiary_name || "Pending"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Father of Repentance</p>
                    <p className="font-medium">
                      {selectedFatherName || (autoFatherLocked ? "Synced from membership" : "Not selected")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Frequency</p>
                    <p className="font-medium">{sponsorshipForm.frequency}</p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Program</p>
                    <p className="font-medium">{sponsorshipForm.program}</p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Monthly amount</p>
                    <p className="font-medium">{currency(Number(sponsorshipForm.monthly_amount || 0))}</p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Budget</p>
                    <p className="font-medium">
                      {selectedBudgetMonthLabel && sponsorshipForm.budget_year
                        ? `${selectedBudgetMonthLabel} ${sponsorshipForm.budget_year}`
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-mute">Volunteer tags</p>
                    <p className="font-medium">
                      {sponsorshipForm.volunteer_services.length
                        ? sponsorshipForm.volunteer_services.join(", ")
                        : "No volunteer service recorded"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleCloseSponsorshipModal}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {wizardStep > 0 && (
              <Button variant="outline" onClick={() => setWizardStep((prev) => Math.max(0, prev - 1))}>
                Back
              </Button>
            )}
            {wizardStep < WIZARD_STEPS.length - 1 ? (
              <Button onClick={handleNextStep}>Next</Button>
            ) : (
              <Button onClick={handleSponsorshipSubmit}>Create sponsorship</Button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  )}
</AnimatePresence>

      <AnimatePresence>
        {showNewcomerForm && (
          <Modal title="Register newcomer" onClose={() => setShowNewcomerForm(false)}>
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">First name</label>
                  <Input
                    value={newcomerForm.first_name}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Last name</label>
                  <Input
                    value={newcomerForm.last_name}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                  <PhoneInput value={newcomerForm.contact_phone} onChange={handleNewcomerPhoneChange} />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Email</label>
                  <Input
                    type="email"
                    value={newcomerForm.contact_email}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, contact_email: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Arrival date</label>
                  <Input
                    type="date"
                    value={newcomerForm.arrival_date}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, arrival_date: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Service type</label>
                  <Input
                    value={newcomerForm.service_type}
                    onChange={(event) =>
                      setNewcomerForm((prev) => ({ ...prev, service_type: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={newcomerForm.notes}
                  onChange={(event) =>
                    setNewcomerForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowNewcomerForm(false)}>
                  Cancel
                </Button>
                <Button onClick={handleNewcomerSubmit}>Save newcomer</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {convertTarget && (
          <Modal
            title={`Convert ${convertTarget.first_name} ${convertTarget.last_name}`}
            onClose={() => setConvertTarget(null)}
          >
            <div className="space-y-3">
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Phone</label>
                  <PhoneInput value={convertForm.phone} onChange={handleConvertPhoneChange} />
                </div>
                <div>
                  <label className="text-xs uppercase text-mute block mb-1">Email</label>
                  <Input
                    type="email"
                    value={convertForm.email}
                    onChange={(event) => setConvertForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Member status</label>
                <Select
                  value={convertForm.status}
                  onChange={(event) =>
                    setConvertForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  <option value="Pending">Pending</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </Select>
              </div>
              <div>
                <label className="text-xs uppercase text-mute block mb-1">Notes</label>
                <Textarea
                  rows={3}
                  value={convertForm.notes}
                  onChange={(event) => setConvertForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConvertTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={handleConvertSubmit}>Convert</Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: number | string;
  description?: string;
};

function MetricCard({ icon: Icon, label, value, description }: MetricCardProps) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="rounded-2xl bg-muted/40 p-3">
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {description && <p className="text-xs text-mute">{description}</p>}
      </div>
    </Card>
  );
}

function currency(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

function formatBudgetMonthYear(month: string, year: string) {
  if (!month || !year) return "";
  const padded = month.padStart(2, "0");
  return `${year}-${padded}`;
}

type ChipButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
};

function ChipButton({ label, active, onClick, className }: ChipButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent cursor-pointer ${
        active ? "bg-accent text-white border-accent shadow-sm" : "bg-card border-border hover:border-accent/60"
      } ${className ?? ""}`}
    >
      {label}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{title}</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
