import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";

type TourStep = {
  id: string;
  title: string;
  description: string;
  interaction?: string;
  selector?: string;
  fallbackSelectors?: string[];
  route?: string;
  optional?: boolean;
};

type TourContextValue = {
  active: boolean;
  currentIndex: number;
  currentStep: TourStep | null;
  steps: TourStep[];
  targetRect: DOMRect | null;
  targetMissing: boolean;
  startTour: (options?: { force?: boolean; reset?: boolean }) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  skipTourForNow: () => void;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

const TOUR_STORAGE_VERSION = "sm_onboarding_tour_v1";
const TOUR_SESSION_SKIP = "sm_onboarding_tour_skip_once";
const TARGET_MISSING_GRACE_MS = 1800;

type TourStatus = {
  completed: boolean;
  lastStepId?: string;
};

function parseStatus(raw?: string | null): TourStatus {
  if (!raw) {
    return { completed: false };
  }
  try {
    const parsed = JSON.parse(raw) as TourStatus;
    return {
      completed: Boolean(parsed.completed),
      lastStepId: parsed.lastStepId,
    };
  } catch {
    return { completed: false };
  }
}

function findVisibleTarget(step: TourStep): HTMLElement | null {
  if (typeof document === "undefined" || !step.selector) return null;
  const selectors = [step.selector, ...(step.fallbackSelectors ?? [])];
  for (const selector of selectors) {
    const candidates = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0;
      if (visible) {
        return candidate;
      }
    }
  }
  return null;
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [active, setActive] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const autoTriggered = useRef(false);
  const noStepsToasted = useRef(false);
  const scrolledStepRef = useRef<string | null>(null);
  const missingTargetSinceRef = useRef<number | null>(null);

  const storageKey = useMemo(() => {
    if (!user) return null;
    const username = (user.username || user.user || "user").toLowerCase();
    return `${TOUR_STORAGE_VERSION}_${username}`;
  }, [user]);

  const tourBlocked = Boolean(user?.must_change_password);

  const sessionSkipKey = useMemo(() => {
    if (!user) return null;
    const username = (user.username || user.user || "user").toLowerCase();
    return `${TOUR_SESSION_SKIP}_${username}`;
  }, [user]);

  const filteredSteps = useMemo(() => {
    const hasMembers = permissions.viewMembers && permissions.isModuleVisible("members");
    const hasPayments = permissions.viewPayments && permissions.isModuleVisible("payments");
    const canRecordPayments = permissions.managePayments;
    const canCreateMembers = permissions.createMembers && hasMembers;
    const canEditMemberCore = permissions.editCore && hasMembers;
    const canViewMemberPayments = permissions.viewPayments && canCreateMembers;
    const hasSponsorships =
      permissions.isModuleVisible("sponsorships") &&
      (permissions.manageSponsorships || permissions.viewSponsorships || permissions.manageNewcomers || permissions.viewNewcomers);
    const canManageSponsorships = permissions.manageSponsorships && permissions.isModuleVisible("sponsorships");
    const hasSchools = permissions.viewSchools && permissions.isModuleVisible("schools");
    const canManageSchools = permissions.manageSchools;

    const base: TourStep[] = [
      {
        id: "sidebar",
        title: "Navigate the console",
        description: "Use the sidebar to jump between dashboard, members, finance, sponsorships, and schools.",
        interaction: "Try selecting a module from the sidebar when you are ready.",
        selector: '[data-tour="sidebar"]',
        route: "/dashboard",
      },
      {
        id: "topbar",
        title: "Theme & profile controls",
        description: "Toggle light/dark mode or open your profile from the top bar avatar.",
        interaction: "Try the theme toggle, then open your avatar menu to see account actions.",
        selector: '[data-tour="topbar-controls"]',
        route: "/dashboard",
      },
      {
        id: "dashboard-search",
        title: "Global search",
        description: "Search members, households, admins, or payments from anywhere.",
        interaction: "Type part of a member name or phone number to see live matches.",
        selector: '[data-tour="dashboard-search"]',
        route: "/dashboard",
      },
      {
        id: "dashboard-actions",
        title: "Quick actions",
        description: "Role-aware shortcuts to add members, record payments, or open sponsorships.",
        interaction: "Open one shortcut to see where it takes you, then return to the tour.",
        selector: '[data-tour="dashboard-quick-actions"]',
        route: "/dashboard",
      },
      {
        id: "members-search",
        title: "Find members fast",
        description: "Search by name, username, email, or phone. Use quick filters to narrow results.",
        interaction: "Type a few letters in the search box and watch the roster narrow.",
        selector: '[data-tour="members-search"]',
        route: "/members",
      },
      {
        id: "members-filters",
        title: "Deep filters",
        description: "Open the filter drawer to refine by status, gender, district, tags, and ministries.",
        interaction: "Open the filters and choose one status or field filter.",
        selector: '[data-tour="members-filters"]',
        route: "/members",
      },
      {
        id: "members-actions",
        title: "Row actions",
        description: "Each member row offers household, spouse, father confessor, export, and archive actions.",
        interaction: "Open the action menu on a member row. If there are no rows yet, create or import members first.",
        selector: '[data-tour="members-row-menu"]',
        fallbackSelectors: ['[data-tour="members-search"]'],
        route: "/members",
        optional: true,
      },
      {
        id: "member-create",
        title: "Create a member",
        description: "Use the Create member button to open the intake form.",
        interaction: "Click Create member to open the form. You can cancel without saving.",
        selector: '[data-tour="member-create"]',
        route: "/members",
      },
      {
        id: "member-detail-nav",
        title: "Edit member details",
        description: "Use the section pills (Identity, Contact, Household, Giving) to jump through the form.",
        interaction: "Click a section pill to jump to that part of the form.",
        selector: '[data-tour="member-section-nav"]',
        route: "/members/new",
      },
      {
        id: "member-save",
        title: "Save changes",
        description: "Use the Save button to persist edits or new members.",
        interaction: "Review required fields before saving. The tour will not submit the form for you.",
        selector: '[data-tour="member-save"]',
        route: "/members/new",
      },
      {
        id: "member-contact",
        title: "Contact details",
        description: "Capture phone, email, and address in the Contact section.",
        interaction: "Open this section and check the phone/email fields.",
        selector: '[data-tour="member-contact"]',
        fallbackSelectors: ['[data-tour="member-section-nav"]'],
        route: "/members/new",
      },
      {
        id: "member-household",
        title: "Household & family",
        description: "Link households, spouses, and children from the Household section.",
        interaction: "Open the household section to review family tools.",
        selector: '[data-tour="member-household"]',
        fallbackSelectors: ['[data-tour="member-section-nav"]'],
        route: "/members/new",
      },
      {
        id: "member-giving",
        title: "Giving & payments",
        description: "Set contribution amounts/methods in the Giving section.",
        interaction: "Open the giving section and review contribution settings.",
        selector: '[data-tour="member-giving"]',
        fallbackSelectors: ['[data-tour="member-section-nav"]'],
        route: "/members/new",
      },
      {
        id: "member-audit",
        title: "Audit trail",
        description: "Review change history in the Audit section.",
        interaction: "Audit entries appear after the member has saved changes.",
        selector: '[data-tour="member-audit"]',
        fallbackSelectors: ['[data-tour="member-section-nav"]'],
        route: "/members/new",
        optional: true,
      },
      {
        id: "household-drawer",
        title: "Household tools",
        description: "Open a member row menu, then choose Manage household to assign or create a household.",
        interaction: "Use a member row action menu to open Manage household.",
        selector: '[data-tour="members-row-menu"]',
        fallbackSelectors: ['[data-tour="members-search"]'],
        route: "/members",
        optional: true,
      },
      {
        id: "spouse-drawer",
        title: "Spouse tools",
        description: "Open a member row menu, then choose Manage spouse to add or edit spouse details.",
        interaction: "Use a member row action menu to open Manage spouse.",
        selector: '[data-tour="members-row-menu"]',
        fallbackSelectors: ['[data-tour="members-search"]'],
        route: "/members",
        optional: true,
      },
      {
        id: "member-payments",
        title: "Member payment history",
        description: "See ledger entries per member and jump to the payment timeline.",
        interaction: "Payment history appears after the member exists and has ledger activity.",
        selector: '[data-tour="member-payments"]',
        fallbackSelectors: ['[data-tour="member-section-nav"]'],
        route: "/members/new",
        optional: true,
      },
      {
        id: "payment-timeline",
        title: "Payment timeline",
        description: "From the Financial activity section, jump into the full payment timeline after the member profile is saved.",
        interaction: "Open a saved member's financial activity, then use the timeline link.",
        selector: '[data-tour="payment-timeline"]',
        fallbackSelectors: ['[data-tour="member-payments"]', '[data-tour="member-section-nav"]'],
        route: "/members/new",
        optional: true,
      },
      {
        id: "payments-summary",
        title: "Finance snapshot",
        description: "Totals per service type and the grand total update with filters for dates, status, and member.",
        interaction: "Adjust a filter and confirm the summary cards update.",
        selector: '[data-tour="payments-summary"]',
        route: "/payments",
      },
      {
        id: "payments-record",
        title: "Record or correct payments",
        description: "Post contributions, school fees, or corrections from the ledger.",
        interaction: "Open Record payment to review the form. Cancel to return without saving.",
        selector: '[data-tour="payments-record"]',
        route: "/payments",
      },
      {
        id: "payments-filters",
        title: "Filter the ledger",
        description: "Use service type, member, dates, method, and status filters.",
        interaction: "Choose a service type or date range to narrow the ledger.",
        selector: '[data-tour="payments-filters"]',
        route: "/payments",
      },
      {
        id: "payments-table",
        title: "Review ledger rows",
        description: "Inspect payment rows and open actions from the ledger table.",
        interaction: "Open a row action when ledger records are present.",
        selector: '[data-tour="payments-table"]',
        route: "/payments",
      },
      {
        id: "sponsorship-wizard",
        title: "New sponsorship wizard",
        description: "Start a sponsorship with co-sponsor search, immigrant selection, program, and reminder channels.",
        interaction: "Open New case to review the wizard. Close it before continuing if you are not creating a case.",
        selector: '[data-tour="sponsorship-wizard"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-filters",
        title: "Sponsorship filters",
        description: "Refine sponsorships by program, frequency, status, reminder channel, and search.",
        interaction: "Try a status or search filter to narrow the board.",
        selector: '[data-tour="sponsorship-filters"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-metrics",
        title: "Sponsorship metrics",
        description: "Review active sponsors, newcomers sponsored, and budget utilization cards.",
        interaction: "Use these cards to check whether sponsorship capacity needs attention.",
        selector: '[data-tour="sponsorship-metrics"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-list",
        title: "Sponsorship board",
        description: "Browse sponsorship rows and open details.",
        interaction: "Open a case row when records are present.",
        selector: '[data-tour="sponsorship-list"]',
        route: "/sponsorships",
      },
      {
        id: "schools-tabs",
        title: "Schools workspace",
        description: "Switch between Abenet literacy and Sunday School to manage enrollments and content.",
        interaction: "Switch tabs to see how each school workspace changes.",
        selector: '[data-tour="schools-tabs"]',
        route: "/schools",
      },
      {
        id: "schools-enrollment",
        title: "Enroll students",
        description: "Create Abenet enrollments, then record tuition payments when families settle invoices.",
        interaction: "Open New enrollment to review the form. Cancel if you are not enrolling now.",
        selector: '[data-tour="schools-enrollment"]',
        route: "/schools",
      },
      {
        id: "schools-abenet-list",
        title: "Abenet roster",
        description: "Filter and review Abenet enrollments.",
        interaction: "Use the roster filters to find an enrollment.",
        selector: '[data-tour="schools-abenet-list"]',
        route: "/schools",
      },
      {
        id: "schools-sunday-list",
        title: "Sunday School roster",
        description: "Switch to Sunday School and view participants.",
        interaction: "Open the Sunday School tab to review participants and payment status.",
        selector: '[data-tour="schools-sunday-list"]',
        fallbackSelectors: ['[data-tour="schools-sunday-tab"]', '[data-tour="schools-tabs"]'],
        route: "/schools",
      },
    ];

    return base.filter((step) => {
      if (step.id.startsWith("members") && !hasMembers) return false;
      if (step.id.startsWith("payments") && !hasPayments) return false;
      if (step.id === "member-create" && !canCreateMembers) return false;
      if (["member-detail-nav", "member-save", "member-contact", "member-household", "member-giving", "member-audit"].includes(step.id) && !canCreateMembers) {
        return false;
      }
      if (["household-drawer", "spouse-drawer"].includes(step.id) && !canEditMemberCore) return false;
      if (["member-payments", "payment-timeline"].includes(step.id) && !canViewMemberPayments) return false;
      if (step.id === "payments-record" && !canRecordPayments) return false;
      if (step.id.startsWith("sponsorship") && !hasSponsorships) return false;
      if (step.id === "sponsorship-wizard" && !canManageSponsorships) return false;
      if (step.id.startsWith("schools") && !hasSchools) return false;
      if (step.id === "schools-enrollment" && !canManageSchools) return false;
      return true;
    });
  }, [permissions]);

  useEffect(() => {
    setSteps(filteredSteps);
    if (user && filteredSteps.length === 0 && !noStepsToasted.current) {
      toast.push("Tour is unavailable for this role right now.");
      noStepsToasted.current = true;
    }
    if (currentIndex >= filteredSteps.length) {
      setCurrentIndex(Math.max(0, filteredSteps.length - 1));
    }
  }, [filteredSteps, toast, user, currentIndex]);

  const readStatus = useCallback((): TourStatus => {
    if (typeof window === "undefined" || !storageKey) return { completed: false };
    return parseStatus(window.localStorage.getItem(storageKey));
  }, [storageKey]);

  const readSessionSkip = useCallback(() => {
    if (typeof window === "undefined" || !sessionSkipKey) return false;
    return window.sessionStorage.getItem(sessionSkipKey) === "1";
  }, [sessionSkipKey]);

  const writeStatus = useCallback(
    (status: TourStatus) => {
      if (typeof window === "undefined" || !storageKey) return;
      window.localStorage.setItem(storageKey, JSON.stringify(status));
    },
    [storageKey]
  );

  const writeSessionSkip = useCallback(() => {
    if (typeof window === "undefined" || !sessionSkipKey) return;
    window.sessionStorage.setItem(sessionSkipKey, "1");
  }, [sessionSkipKey]);

  const finishTour = useCallback(() => {
    setActive(false);
    setTargetRect(null);
    setTargetMissing(false);
    setCurrentIndex(0);
    scrolledStepRef.current = null;
    missingTargetSinceRef.current = null;
    writeStatus({ completed: true });
  }, [writeStatus]);

  const startTour = useCallback(
    (options?: { force?: boolean; reset?: boolean }) => {
      if (tourBlocked) return;
      const force = options?.force ?? false;
      const reset = options?.reset ?? false;
      if (!storageKey || !user) return;
      if (!force && readSessionSkip()) return;
      const mainSteps = filteredSteps;
      if (!mainSteps.length) {
        toast.push("No tour steps available for this role.");
        return;
      }
      const status = readStatus();
      if (!force && status.completed) return;
      const startIndex = !reset && status.lastStepId ? Math.max(0, mainSteps.findIndex((step) => step.id === status.lastStepId)) : 0;
      const safeIndex = startIndex >= 0 ? startIndex : 0;
      scrolledStepRef.current = null;
      missingTargetSinceRef.current = null;
      setTargetMissing(false);
      setActive(true);
      setCurrentIndex(safeIndex);
      setSteps(mainSteps);
      writeStatus({
        completed: false,
        lastStepId: mainSteps[safeIndex]?.id,
      });
    },
    [filteredSteps, readSessionSkip, readStatus, storageKey, toast, tourBlocked, user, writeStatus]
  );

  const previousStep = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const skipTour = useCallback(() => {
    scrolledStepRef.current = null;
    finishTour();
  }, [finishTour]);

  const skipTourForNow = useCallback(() => {
    scrolledStepRef.current = null;
    setActive(false);
    setTargetRect(null);
    setCurrentIndex(0);
    writeSessionSkip();
  }, [writeSessionSkip]);

  useEffect(() => {
    if (tourBlocked) {
      setActive(false);
      setTargetRect(null);
      setTargetMissing(false);
      setCurrentIndex(0);
      missingTargetSinceRef.current = null;
      return;
    }
    if (!active) return;
    const current = steps[currentIndex];
    if (!current) {
      finishTour();
      return;
    }

    if (current.route && current.route !== location.pathname) {
      navigate(current.route);
    }

    const updateRect = () => {
      if (!current.selector) {
        setTargetRect(null);
        return;
      }
      const el = findVisibleTarget(current);
      if (el) {
        missingTargetSinceRef.current = null;
        setTargetMissing(false);
        if (scrolledStepRef.current !== current.id) {
          const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          el.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
          scrolledStepRef.current = current.id;
        }
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        writeStatus({
          completed: false,
          lastStepId: current.id,
        });
      } else {
        if (missingTargetSinceRef.current === null) {
          missingTargetSinceRef.current = Date.now();
        }
        setTargetMissing(Date.now() - missingTargetSinceRef.current > TARGET_MISSING_GRACE_MS);
        setTargetRect(null);
      }
    };

    updateRect();
    const interval = window.setInterval(updateRect, 500);
    const handleResize = () => updateRect();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [active, currentIndex, finishTour, location.pathname, navigate, steps, tourBlocked, writeStatus]);

  useEffect(() => {
    scrolledStepRef.current = null;
    missingTargetSinceRef.current = null;
    setTargetMissing(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!active) return;
    const current = steps[currentIndex];
    if (!current) return;
    writeStatus({
      completed: false,
      lastStepId: current.id,
    });
  }, [active, currentIndex, steps, writeStatus]);

  useEffect(() => {
    if (!user || !storageKey || !steps.length || tourBlocked) return;
    const params = new URLSearchParams(location.search);
    if (params.get("tour") === "start") {
      autoTriggered.current = true;
      startTour({ force: true, reset: true });
      return;
    }
    if (autoTriggered.current) return;
    const status = readStatus();
    if (!status.completed && !readSessionSkip()) {
      autoTriggered.current = true;
      startTour({ reset: false });
    }
  }, [location.search, readStatus, readSessionSkip, startTour, storageKey, steps.length, tourBlocked, user]);

  const contextValue: TourContextValue = {
    active,
    currentIndex,
    currentStep: steps[currentIndex] ?? null,
    steps,
    targetRect,
    targetMissing,
    startTour,
    nextStep: () => {
      if (currentIndex + 1 >= steps.length) {
        finishTour();
      } else {
        setCurrentIndex((prev) => prev + 1);
      }
    },
    previousStep,
    skipTour,
    skipTourForNow,
  };

  return <TourContext.Provider value={contextValue}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour must be used within a TourProvider");
  }
  return ctx;
}
