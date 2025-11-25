import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";

type TourStep = {
  id: string;
  title: string;
  description: string;
  selector?: string;
  route?: string;
};

type TourContextValue = {
  active: boolean;
  currentIndex: number;
  currentStep: TourStep | null;
  steps: TourStep[];
  targetRect: DOMRect | null;
  startTour: (options?: { force?: boolean; reset?: boolean }) => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTour: () => void;
  skipTourForNow: () => void;
};

const TourContext = createContext<TourContextValue | undefined>(undefined);

const TOUR_STORAGE_VERSION = "sm_onboarding_tour_v1";
const TOUR_SESSION_SKIP = "sm_onboarding_tour_skip_once";

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
  const autoTriggered = useRef(false);
  const noStepsToasted = useRef(false);
  const scrolledStepRef = useRef<string | null>(null);

  const storageKey = useMemo(() => {
    if (!user) return null;
    const username = (user.username || user.user || "user").toLowerCase();
    return `${TOUR_STORAGE_VERSION}_${username}`;
  }, [user]);

  const sessionSkipKey = useMemo(() => {
    if (!user) return null;
    const username = (user.username || user.user || "user").toLowerCase();
    return `${TOUR_SESSION_SKIP}_${username}`;
  }, [user]);

  const filteredSteps = useMemo(() => {
    const hasMembers = permissions.viewMembers;
    const hasPayments = permissions.viewPayments;
    const canRecordPayments = permissions.managePayments;
    const hasSponsorships =
      permissions.manageSponsorships || permissions.viewSponsorships || permissions.manageNewcomers || permissions.viewNewcomers;
    const hasSchools = permissions.viewSchools;
    const canManageSchools = permissions.manageSchools;

    const base: TourStep[] = [
      {
        id: "sidebar",
        title: "Navigate the console",
        description: "Use the sidebar to jump between dashboard, members, finance, sponsorships, and schools.",
        selector: '[data-tour="sidebar"]',
        route: "/dashboard",
      },
      {
        id: "topbar",
        title: "Theme & profile controls",
        description: "Toggle light/dark mode or open your profile from the top bar avatar.",
        selector: '[data-tour="theme-toggle"]',
        route: "/dashboard",
      },
      {
        id: "dashboard-search",
        title: "Global search",
        description: "Search members, households, admins, or payments from anywhere.",
        selector: '[data-tour="dashboard-search"]',
        route: "/dashboard",
      },
      {
        id: "dashboard-actions",
        title: "Quick actions",
        description: "Role-aware shortcuts to add members, record payments, or open sponsorships.",
        selector: '[data-tour="dashboard-quick-actions"]',
        route: "/dashboard",
      },
      {
        id: "members-search",
        title: "Find members fast",
        description: "Search by name, username, email, or phone. Use quick filters to narrow results.",
        selector: '[data-tour="members-search"]',
        route: "/members",
      },
      {
        id: "members-filters",
        title: "Deep filters",
        description: "Open the filter drawer to refine by status, gender, district, tags, and ministries.",
        selector: '[data-tour="members-filters"]',
        route: "/members",
      },
      {
        id: "members-actions",
        title: "Row actions",
        description: "Each member row offers household, spouse, father confessor, export, and archive actions.",
        selector: '[data-tour="members-row-menu"]',
        route: "/members",
      },
      {
        id: "member-create",
        title: "Create a member",
        description: "Use the Create member button to open the intake form.",
        selector: '[data-tour="member-create"]',
        route: "/members",
      },
      {
        id: "member-detail-nav",
        title: "Edit member details",
        description: "Use the section pills (Identity, Contact, Household, Giving) to jump through the form.",
        selector: '[data-tour="member-section-nav"]',
        route: "/members/new",
      },
      {
        id: "member-save",
        title: "Save changes",
        description: "Use the Save button to persist edits or new members.",
        selector: '[data-tour="member-save"]',
        route: "/members/new",
      },
      {
        id: "member-contact",
        title: "Contact details",
        description: "Capture phone, email, and address in the Contact section.",
        selector: '[data-tour="member-contact"]',
        route: "/members/new",
      },
      {
        id: "member-household",
        title: "Household & family",
        description: "Link households, spouses, and children from the Household section.",
        selector: '[data-tour="member-household"]',
        route: "/members/new",
      },
      {
        id: "member-giving",
        title: "Giving & payments",
        description: "Set contribution amounts/methods in the Giving section.",
        selector: '[data-tour="member-giving"]',
        route: "/members/new",
      },
      {
        id: "member-audit",
        title: "Audit trail",
        description: "Review change history in the Audit section.",
        selector: '[data-tour="member-audit"]',
        route: "/members/new",
      },
      {
        id: "household-drawer",
        title: "Manage household",
        description: "Use the Household drawer to assign or create households in bulk or per member.",
        selector: '[data-tour="household-drawer"]',
        route: "/members",
      },
      {
        id: "spouse-drawer",
        title: "Manage spouse",
        description: "Open the Spouse drawer from the member list actions to add or edit spouse details.",
        selector: '[data-tour="spouse-drawer"]',
        route: "/members",
      },
      {
        id: "member-payments",
        title: "Member payment history",
        description: "See ledger entries per member and jump to the payment timeline.",
        selector: '[data-tour="member-payments"]',
        route: "/members/new",
      },
      {
        id: "payment-timeline",
        title: "Payment timeline",
        description: "Open the member-specific payment timeline for detailed ledger events.",
        selector: '[data-tour="payment-timeline"]',
        route: "/members/new",
      },
      {
        id: "payments-summary",
        title: "Finance snapshot",
        description: "Totals per service type and the grand total update with filters for dates, status, and member.",
        selector: '[data-tour="payments-summary"]',
        route: "/payments",
      },
      {
        id: "payments-record",
        title: "Record or correct payments",
        description: "Post contributions, school fees, or corrections from the ledger.",
        selector: '[data-tour="payments-record"]',
        route: "/payments",
      },
      {
        id: "payments-filters",
        title: "Filter the ledger",
        description: "Use service type, member, dates, method, and status filters.",
        selector: '[data-tour="payments-filters"]',
        route: "/payments",
      },
      {
        id: "payments-table",
        title: "Review ledger rows",
        description: "Inspect payment rows and open actions from the ledger table.",
        selector: '[data-tour="payments-table"]',
        route: "/payments",
      },
      {
        id: "sponsorship-wizard",
        title: "New sponsorship wizard",
        description: "Start a sponsorship with sponsor search, beneficiary selection, program, and reminder channels.",
        selector: '[data-tour="sponsorship-wizard"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-filters",
        title: "Sponsorship filters",
        description: "Refine sponsorships by program, frequency, status, reminder channel, and search.",
        selector: '[data-tour="sponsorship-filters"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-metrics",
        title: "Sponsorship metrics",
        description: "Review active sponsors, newcomers sponsored, and budget utilization cards.",
        selector: '[data-tour="sponsorship-metrics"]',
        route: "/sponsorships",
      },
      {
        id: "sponsorship-list",
        title: "Sponsorship board",
        description: "Browse sponsorship rows and open details.",
        selector: '[data-tour="sponsorship-list"]',
        route: "/sponsorships",
      },
      {
        id: "schools-tabs",
        title: "Schools workspace",
        description: "Switch between Abenet literacy and Sunday School to manage enrollments and content.",
        selector: '[data-tour="schools-tabs"]',
        route: "/schools",
      },
      {
        id: "schools-enrollment",
        title: "Enroll students",
        description: "Create Abenet enrollments, then record tuition payments when families settle invoices.",
        selector: '[data-tour="schools-enrollment"]',
        route: "/schools",
      },
      {
        id: "schools-abenet-list",
        title: "Abenet roster",
        description: "Filter and review Abenet enrollments.",
        selector: '[data-tour="schools-abenet-list"]',
        route: "/schools",
      },
      {
        id: "schools-sunday-list",
        title: "Sunday School roster",
        description: "Switch to Sunday School and view participants.",
        selector: '[data-tour="schools-sunday-list"]',
        route: "/schools",
      },
    ];

    return base.filter((step) => {
      if (step.id.startsWith("members") && !hasMembers) return false;
      if (step.id.startsWith("payments") && !hasPayments) return false;
      if (step.id === "payments-record" && !canRecordPayments) return false;
      if (step.id.startsWith("sponsorship") && !hasSponsorships) return false;
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
    setCurrentIndex(0);
    scrolledStepRef.current = null;
    writeStatus({ completed: true });
  }, [writeStatus]);

  const startTour = useCallback(
    (options?: { force?: boolean; reset?: boolean }) => {
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
      setActive(true);
      setCurrentIndex(safeIndex);
      setSteps(mainSteps);
      writeStatus({
        completed: false,
        lastStepId: mainSteps[safeIndex]?.id,
      });
    },
    [filteredSteps, readSessionSkip, readStatus, storageKey, toast, user, writeStatus]
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
      const el = document.querySelector(current.selector) as HTMLElement | null;
      if (el) {
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
  }, [active, currentIndex, finishTour, location.pathname, navigate, steps, writeStatus]);

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
    if (!user || !storageKey || !steps.length) return;
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
  }, [location.search, readStatus, readSessionSkip, startTour, storageKey, user]);

  const contextValue: TourContextValue = {
    active,
    currentIndex,
    currentStep: steps[currentIndex] ?? null,
    steps,
    targetRect,
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
