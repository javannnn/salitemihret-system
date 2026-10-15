import { useEffect, useMemo, useState, useCallback, lazy, Suspense, type FormEvent } from "react";
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Eye,
  EyeOff,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Moon,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sun,
  User,
  UserPlus,
  Users,
} from "lucide-react";

import { getTokenExpiry, isTokenExpired, login, logout } from "@/lib/auth";
import { Card, Button, Badge, Textarea, Input } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/components/Toast";
import { activateLicense, ApiError, getLicenseStatus, getToken, LicenseStatusResponse } from "@/lib/api";
import {
  getSessionIdleRemainingMs,
  isSessionIdleExpired,
  notifySessionExpired,
  recordSessionActivity,
  SessionExpiryReason,
  subscribeSessionExpired,
  subscribeSessionRestored,
} from "@/lib/session";
import { attemptChunkReload } from "@/lib/recovery";
import { useTour } from "@/context/TourContext";
import { TourOverlay } from "@/components/Tour/TourOverlay";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ChatProvider } from "@/context/ChatContext";
import { ChatWidget } from "@/components/Chat/ChatWidget";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useRecaptcha } from "@/hooks/useRecaptcha";

const AccountProfile = lazy(() => import("@/pages/Account/Profile"));

const routePreloaders: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/members": () => import("@/pages/Members/List"),
  "/members/new": () => import("@/pages/Members/Create"),
  "/payments": () => import("@/pages/Payments/Ledger"),
  "/newcomers": () => import("@/pages/Newcomers"),
  "/sponsorships": () => import("@/pages/Sponsorships"),
  "/schools": () => import("@/pages/Schools"),
  "/volunteers": () => import("@/pages/Volunteers"),
  "/parish-councils": () => import("@/pages/ParishCouncils"),
  "/admin/users": () => import("@/pages/Admin/Users/List"),
  "/admin/users/roles": () => import("@/pages/Admin/Users/Roles"),
  "/admin/email": () => import("@/pages/Admin/Email/Client"),
  "/admin/reports": () => import("@/pages/Admin/Reports/Client"),
  "/account": () => import("@/pages/Account/Profile"),
};

const preloadRoute = (path: string) => {
  const loader = routePreloaders[path];
  if (loader) {
    loader().catch((error) => {
      attemptChunkReload(error);
    });
  }
};

export default function AppShell() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const permissions = usePermissions();
  const isSuperAdmin = user?.is_super_admin ?? false;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const location = useLocation();
  const toast = useToast();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusResponse | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseStatusOpen, setLicenseStatusOpen] = useState(false);
  const [licenseToken, setLicenseToken] = useState("");
  const [licenseSubmitting, setLicenseSubmitting] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reloginLoading, setReloginLoading] = useState(false);
  const [reloginError, setReloginError] = useState("");
  const [sessionExpiredReason, setSessionExpiredReason] = useState<SessionExpiryReason>("expired");
  const tour = useTour();
  const recaptcha = useRecaptcha();
  const isLocalHost =
    typeof window !== "undefined" && ["127.0.0.1", "localhost"].includes(window.location.hostname);
  const shouldUseRecaptcha = Boolean(recaptcha.siteKey) && !isLocalHost;
  const recaptchaBlocking = shouldUseRecaptcha && !recaptcha.ready && !recaptcha.error;
  const recaptchaUnavailable = shouldUseRecaptcha && Boolean(recaptcha.error);

  const initials = useMemo(() => {
    const source = user?.full_name || user?.username || user?.user || "";
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "U";
  }, [user]);

  const navItems = useMemo(() => {
    const showMembers = permissions.isModuleVisible("members");
    const showPayments = permissions.isModuleVisible("payments");
    const showNewcomers = permissions.isModuleVisible("newcomers");
    const showSponsorships = permissions.isModuleVisible("sponsorships");
    const showVolunteers = permissions.isModuleVisible("volunteers");
    const showParishCouncils = permissions.isModuleVisible("parish_councils");
    const showSchools = permissions.isModuleVisible("schools");
    const showReports = permissions.isModuleVisible("reports");
    const showUsers = permissions.isModuleVisible("users");
    const canViewOverviewReport = permissions.canAccessReport("overview");
    const canViewMembersReport = permissions.viewMembers && permissions.canAccessReport("members");
    const canViewPaymentsReport = permissions.viewPayments && permissions.canAccessReport("payments");
    const canViewSponsorshipsReport = permissions.viewSponsorships && permissions.canAccessReport("sponsorships");
    const canViewNewcomersReport = permissions.viewNewcomers && permissions.canAccessReport("newcomers");
    const canViewSchoolsReport = permissions.viewSchools && permissions.canAccessReport("schools");
    const canViewCouncilsReport = permissions.canAccessReport("councils");
    const canViewReports =
      showReports &&
      (
        canViewOverviewReport ||
        canViewMembersReport ||
        canViewNewcomersReport ||
        canViewPaymentsReport ||
        canViewSponsorshipsReport ||
        canViewSchoolsReport ||
        canViewCouncilsReport
      );

    const items = [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, visible: true },
      { label: "Members", to: "/members", icon: Users, visible: showMembers && permissions.viewMembers },
      { label: "Payments", to: "/payments", icon: CreditCard, visible: showPayments && permissions.viewPayments },
      {
        label: "Newcomers",
        to: "/newcomers",
        icon: UserPlus,
        visible: showNewcomers && (permissions.viewNewcomers || permissions.manageNewcomers),
      },
      {
        label: "Sponsorships",
        to: "/sponsorships",
        icon: HeartHandshake,
        visible: showSponsorships && (permissions.viewSponsorships || permissions.manageSponsorships),
      },
      {
        label: "Volunteers",
        to: "/volunteers",
        icon: HandHeart,
        visible: showVolunteers && (permissions.viewVolunteers || permissions.manageVolunteers),
      },
      {
        label: "Parish Councils",
        to: "/parish-councils",
        icon: Building2,
        visible: showParishCouncils && (permissions.viewParishCouncils || permissions.manageParishCouncils),
      },
      {
        label: "Schools",
        to: "/schools",
        icon: GraduationCap,
        visible: showSchools && permissions.viewSchools,
      },
      {
        label: "Reports",
        to: "/admin/reports",
        icon: BarChart3,
        visible: canViewReports
      },
      { label: "User Management", to: "/admin/users", icon: ShieldCheck, visible: isSuperAdmin && showUsers },
      { label: "Email", to: "/admin/email", icon: Mail, visible: isSuperAdmin },
    ];
    return items.filter((item) => item.visible);
  }, [
    isSuperAdmin,
    permissions,
  ]);

  const mobileNavItems = useMemo(() => (navItems.length ? navItems : [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, visible: true }]), [navItems]);

  const activeNavItem = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.to)),
    [location.pathname, navItems]
  );

  const isMobile = useMediaQuery("(max-width: 1023px)");

  if (loading) {
    return <div className="p-6 text-sm text-mute">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const canManageLicense = permissions.hasRole("Admin");

  const refreshLicense = useCallback(async () => {
    setLicenseLoading(true);
    try {
      const status = await getLicenseStatus();
      setLicenseStatus(status);
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError && error.status === 401) {
        toast.push("Please sign in again to refresh license status.");
      } else {
        toast.push("Unable to fetch license status.");
      }
    } finally {
      setLicenseLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!user || user.must_change_password) {
      setLicenseLoading(false);
      return;
    }
    let active = true;
    setLicenseLoading(true);
    getLicenseStatus()
      .then((status) => {
        if (active) {
          setLicenseStatus(status);
        }
      })
      .catch((error) => {
        console.error(error);
        if (active) {
          toast.push("Unable to fetch license status.");
        }
      })
      .finally(() => {
        if (active) {
          setLicenseLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [user, toast]);

  useEffect(() => {
    const unsubscribe = subscribeSessionExpired((reason) => {
      setSessionExpiredReason(reason);
      setReloginError("");
      setPassword("");
      setShowPassword(false);
      setSessionExpired(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSessionRestored(() => {
      setSessionExpired(false);
      setSessionExpiredReason("expired");
      setPassword("");
      setShowPassword(false);
      setReloginError("");
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    setSessionExpired(false);
    setSessionExpiredReason("expired");
    setPassword("");
    setShowPassword(false);
    setReloginError("");
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeoutId: number | null = null;
    const clearScheduledCheck = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const checkSession = () => {
      if (sessionExpired) return false;
      const token = getToken();
      if (!token) {
        notifySessionExpired("unauthorized");
        return true;
      }
      if (isTokenExpired(token)) {
        notifySessionExpired("expired");
        return true;
      }
      if (isSessionIdleExpired()) {
        notifySessionExpired("idle");
        return true;
      }
      return false;
    };

    const scheduleSessionCheck = () => {
      clearScheduledCheck();
      if (sessionExpired) return;
      const token = getToken();
      if (!token) return;
      const now = Date.now();
      const tokenExpiry = getTokenExpiry(token);
      const deadlines = [getSessionIdleRemainingMs(now)];
      if (tokenExpiry) {
        deadlines.push(Math.max(0, tokenExpiry - now));
      }
      const nextCheckIn = Math.max(250, Math.min(...deadlines) + 100);
      timeoutId = window.setTimeout(() => {
        if (!checkSession()) {
          scheduleSessionCheck();
        }
      }, nextCheckIn);
    };

    const handleActivity = () => {
      if (document.visibilityState === "hidden") return;
      if (checkSession()) return;
      recordSessionActivity();
      scheduleSessionCheck();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleActivity();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "access_token" && event.newValue && !isTokenExpired(event.newValue)) {
        setSessionExpired(false);
        setSessionExpiredReason("expired");
        recordSessionActivity(Date.now(), true);
        scheduleSessionCheck();
        return;
      }
      if (event.key === "access_token" || event.key === "session_last_activity_at") {
        if (!checkSession()) {
          scheduleSessionCheck();
        }
      }
    };

    if (!checkSession()) {
      recordSessionActivity(Date.now(), true);
      scheduleSessionCheck();
    }

    window.addEventListener("focus", handleActivity);
    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("pointermove", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("scroll", handleActivity, { passive: true });
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearScheduledCheck();
      window.removeEventListener("focus", handleActivity);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("scroll", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [sessionExpired]);

  useEffect(() => {
    if (!navItems.length) return;
    const idleCallback =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ||
      ((cb: () => void) => window.setTimeout(cb, 800));
    const cancelIdle =
      (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback ||
      window.clearTimeout;
    const handle = idleCallback(() => {
      navItems.forEach((item) => preloadRoute(item.to));
    });
    return () => cancelIdle(handle);
  }, [navItems]);

  const handleLicenseActivate = async () => {
    if (!licenseToken.trim()) {
      toast.push("Paste the license token to continue.");
      return;
    }
    setLicenseSubmitting(true);
    try {
      const status = await activateLicense(licenseToken.trim());
      setLicenseStatus(status);
      setLicenseModalOpen(false);
      setLicenseToken("");
      toast.push("License installed successfully.");
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError) {
        toast.push(error.body || "License activation failed.");
      } else {
        toast.push("License activation failed.");
      }
    } finally {
      setLicenseSubmitting(false);
    }
  };

  const licenseIntent =
    licenseStatus?.state === "expired" || licenseStatus?.state === "invalid"
      ? "error"
      : licenseStatus?.state === "trial" || (licenseStatus?.days_remaining ?? 0) <= 30
        ? "warning"
        : "info";

  const licenseClasses =
    licenseIntent === "error"
      ? "border-red-300 bg-red-50 text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200"
      : licenseIntent === "warning"
        ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200"
        : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200";
  const isLicenseActive = licenseStatus?.state === "active";
  const licenseCustomerLabel = licenseStatus?.customer || (isLicenseActive ? "SaliteMihret EOTC" : null);
  const licenseExpiryLabel = licenseStatus?.expires_at
    ? new Date(licenseStatus.expires_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const showLicenseDaysRemaining =
    (licenseStatus?.state === "active" || licenseStatus?.state === "trial") &&
    (licenseStatus?.days_remaining ?? 0) > 0;
  const sessionExpiredMessage =
    sessionExpiredReason === "idle"
      ? "We locked this workspace after 30 minutes without activity. Enter your password to pick up where you left off."
      : sessionExpiredReason === "expired"
        ? "This sign-in reached its 5-hour limit. Enter your password to continue without losing your place."
        : "We could not verify this sign-in. Enter your password to reconnect securely.";

  const handleSessionResume = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password || reloginLoading) return;

    const accountIdentifier = user?.user || user?.username || "";
    if (!accountIdentifier) {
      setReloginError("We could not identify the account to restore. Sign out and sign in again.");
      return;
    }
    if (recaptchaUnavailable) {
      setReloginError("Security verification is unavailable. Retry the check before continuing.");
      return;
    }
    if (recaptchaBlocking) {
      setReloginError("Security verification is still loading. Please wait a moment.");
      return;
    }

    setReloginLoading(true);
    setReloginError("");

    try {
      let token: string | undefined;
      if (shouldUseRecaptcha) {
        try {
          token = await recaptcha.execute("login");
        } catch (error) {
          console.error("reCAPTCHA failed", error);
          setReloginError("Security verification failed. Retry and submit your password again.");
          return;
        }
      }

      await login(accountIdentifier, password, token);
      setSessionExpired(false);
      setSessionExpiredReason("expired");
      setPassword("");
      setShowPassword(false);
      setReloginError("");
    } catch (error) {
      console.error(error);
      setReloginError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "We could not restore this session. Check your connection and try again."
      );
    } finally {
      setReloginLoading(false);
    }
  };

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar_collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sidebar_collapsed", isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  const toggleSidebar = () => setIsCollapsed((prev) => !prev);

  return (
    <div className={`min-h-screen bg-bg text-ink lg:grid transition-all duration-300 ${isCollapsed ? "lg:grid-cols-[92px_1fr]" : "lg:grid-cols-[300px_1fr]"}`}>
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 92 : 300
        }}
        className={`hidden lg:flex inset-y-0 left-0 z-50 h-full border-r border-border bg-card/95 backdrop-blur-md flex-col overflow-hidden transition-all duration-300 lg:static lg:bg-card/60`}
      >
        <div className="flex items-center gap-3 p-6">
          <div className="relative flex-shrink-0">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-xl shadow-lg">
              S
            </div>
            <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-emerald-500 border-2 border-card" />
          </div>

          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex min-w-0 flex-col overflow-hidden"
              >
                <div className="logo-shimmer max-w-[10.75rem] text-[0.95rem] font-bold leading-[1.05] tracking-tight">
                  StMaryEotcEdmonton-
                  <span className="block">Church</span>
                </div>
                <div className="text-xs uppercase tracking-wider text-mute font-medium">Membership Console</div>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={toggleSidebar}
            className="ml-auto h-10 w-10 hidden lg:flex items-center justify-center rounded-xl border border-border hover:bg-accent/10 transition"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav data-tour="sidebar" className="flex-1 px-4 space-y-3 py-6 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onMouseEnter={() => preloadRoute(item.to)}
              onFocus={() => preloadRoute(item.to)}
              className={({ isActive }) =>
                `relative group flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-200 overflow-hidden ${isActive
                  ? "bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg dark:from-slate-800 dark:to-slate-900 ring-1 ring-white/10"
                  : "text-mute hover:bg-accent/5 hover:text-ink"
                } ${isCollapsed ? "lg:justify-center" : ""}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-1.5 rounded-r-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                    />
                  )}

                  <div className={`relative z-10 flex-shrink-0 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-105"}`}>
                    <item.icon size={28} className={isActive ? "text-white" : "text-current opacity-70"} />
                  </div>

                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="text-lg font-medium truncate z-10"
                    >
                      {item.label}
                    </motion.span>
                  )}

                  {isCollapsed && isActive && (
                    <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-indigo-400 shadow-glow" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </motion.aside>
      <main className="relative min-w-0 pb-24 lg:pb-0">
        <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur px-4 lg:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] uppercase tracking-wide text-mute lg:hidden">Workspace</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base font-semibold truncate lg:hidden">{activeNavItem?.label ?? "Dashboard"}</span>
              </div>
            </div>
          </div>
          <div data-tour="topbar-controls" className="flex items-center gap-3">
            <ThemeToggle />
            <button
              data-tour="avatar-menu"
              className="relative h-12 w-12 flex items-center justify-center rounded-full bg-gradient-to-br from-slate-900 via-slate-700 to-slate-500 text-white shadow-lg ring-2 ring-white/50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              aria-label="Account menu"
            >
              <span className="text-sm font-semibold">{initials}</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {accountMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute top-16 right-6 z-30 w-56 rounded-2xl border border-border bg-card shadow-xl backdrop-blur"
            >
              <div className="px-4 py-3 border-b border-border">
                <div className="text-sm font-semibold">{user?.full_name || user?.username || user?.user}</div>
                <div className="text-xs text-mute">{user?.username || user?.user}</div>
              </div>
              <div className="p-2 space-y-1 text-sm">
                <button
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent/10"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setAccountModalOpen(true);
                  }}
                >
                  My account
                </button>
                {tour.steps.length > 0 && (
                  <button
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent/10"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      tour.startTour({ force: true, reset: true });
                    }}
                  >
                    Show tour
                  </button>
                )}
                {isSuperAdmin && permissions.isModuleVisible("users") && (
                  <button
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent/10"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      navigate("/admin/users");
                    }}
                  >
                    User management
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-accent/10"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    setLicenseStatusOpen(true);
                  }}
                >
                  License status
                </button>
                <button
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    logout();
                  }}
                >
                  Sign out
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <section className="px-6 lg:px-10 py-8">
          <AnimatePresence mode="sync">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.12 }}
              className="space-y-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </section>
      </main>
      {accountModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setAccountModalOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-14 sm:items-center">
            <Card className="w-full max-w-5xl max-h-[90vh] h-[90vh] sm:h-auto flex flex-col overflow-hidden bg-white text-slate-900 shadow-2xl border border-slate-200 dark:bg-black dark:text-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="h-9 w-9 inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-white">
                    <User size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">My Account</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Profile, password, and member link</p>
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setAccountModalOpen(false)}>
                  Close
                </Button>
              </div>
              <div className="overflow-y-auto p-4 flex-1">
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button variant="ghost" onClick={() => tour.startTour({ force: true, reset: true })}>
                    Relaunch main tour
                  </Button>
                </div>
                <Suspense fallback={<div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
                  <AccountProfile />
                </Suspense>
              </div>
            </Card>
          </div>
        </>
      )}
      {licenseModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Install license</h2>
              <Button
                variant="ghost"
                className="border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => setLicenseModalOpen(false)}
              >
                Close
              </Button>
            </div>
            <p className="text-sm text-mute">
              Paste the license token provided by Se’alite Mihret support. Tokens are signed and can be
              revoked if tampered with.
            </p>
            <Textarea
              rows={6}
              value={licenseToken}
              onChange={(event) => setLicenseToken(event.target.value)}
              placeholder="-----BEGIN LICENSE-----"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                className="border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => setLicenseModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleLicenseActivate} disabled={licenseSubmitting}>
                {licenseSubmitting ? "Saving…" : "Activate license"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      {licenseStatusOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <Card className="w-full max-w-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">License status</h2>
              <Button
                variant="ghost"
                className="border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={() => setLicenseStatusOpen(false)}
              >
                Close
              </Button>
            </div>
            {licenseStatus ? (
              <div className={`p-4 border rounded-2xl ${licenseClasses}`}>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {isLicenseActive ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
                  <span>
                    {licenseStatus.state === "active"
                      ? "License active"
                      : licenseStatus.state === "trial"
                        ? "Trial mode"
                        : licenseStatus.state === "expired"
                          ? "License expired"
                          : "License needs attention"}
                  </span>
                </div>
                <p className="text-sm mt-2">
                  {isLicenseActive
                    ? "Full access is enabled for this deployment."
                    : licenseStatus.message}
                </p>
                {licenseExpiryLabel && (
                  <p className="mt-1 text-sm">
                    {licenseStatus.state === "trial"
                      ? "Trial ends"
                      : licenseStatus.state === "expired"
                        ? "Expired"
                        : "Valid through"}{" "}
                    <strong>{licenseExpiryLabel}</strong>.
                    {showLicenseDaysRemaining && (
                      <span className="ml-1">
                        {licenseStatus.days_remaining} day{licenseStatus.days_remaining === 1 ? "" : "s"} remaining.
                      </span>
                    )}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs uppercase tracking-wide">
                    Status: {licenseStatus.state.toUpperCase()}
                  </span>
                  {licenseCustomerLabel && (
                    <span className="text-xs uppercase tracking-wide">
                      Licensed to: {licenseCustomerLabel}
                    </span>
                  )}
                  {licenseLoading && <span className="text-xs text-mute">Refreshing…</span>}
                </div>
              </div>
            ) : (
              <div className="text-sm text-mute">Loading license status…</div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                className="border-slate-200 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                onClick={refreshLicense}
                disabled={licenseLoading}
              >
                Refresh
              </Button>
              {canManageLicense && (
                <Button
                  onClick={() => {
                    setLicenseStatusOpen(false);
                    setLicenseModalOpen(true);
                  }}
                >
                  {licenseStatus?.state === "active" ? "Update license" : "Install license"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
      <AnimatePresence>
        {sessionExpired && (
          <>
            <motion.div
              className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <div className="fixed inset-0 z-[101] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
              <motion.section
                role="dialog"
                aria-modal="true"
                aria-labelledby="session-resume-title"
                aria-describedby="session-resume-description"
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="relative my-auto max-h-[calc(100svh-2rem)] w-full max-w-[460px] overflow-y-auto rounded-2xl border border-white/15 bg-white text-slate-950 shadow-[0_28px_90px_rgba(0,0,0,0.38)] dark:border-white/10 dark:bg-[#101114] dark:text-white"
              >
                <div className="h-1 w-full bg-[#a61b29] dark:bg-[#d63649]" />
                <div className="p-5 sm:p-7">
                  <header className="flex items-start gap-4">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-rose-50 text-[#a61b29] ring-1 ring-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/15">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-xs font-semibold text-[#a61b29] dark:text-rose-300">Workspace locked</p>
                      <h2 id="session-resume-title" className="mt-1 text-xl font-semibold text-slate-950 dark:text-white">
                        Sign in to continue
                      </h2>
                    </div>
                  </header>

                  <p
                    id="session-resume-description"
                    className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300"
                  >
                    {sessionExpiredMessage}
                  </p>

                  <div className="mt-5 flex items-center gap-3 border-y border-slate-200 py-4 dark:border-white/10">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-semibold text-white dark:bg-white dark:text-slate-950">
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">Signed in as</p>
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {user?.full_name || user?.username || "Current account"}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.user}</p>
                    </div>
                    <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                  </div>

                  <form onSubmit={handleSessionResume} className="mt-5 space-y-4" aria-busy={reloginLoading}>
                    <div className="space-y-2">
                      <label htmlFor="session-resume-password" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        Password
                      </label>
                      <div className="relative">
                        <LockKeyhole
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                          aria-hidden="true"
                        />
                        <Input
                          id="session-resume-password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => {
                            setPassword(event.target.value);
                            if (reloginError) setReloginError("");
                          }}
                          className="h-12 rounded-lg border-slate-300 bg-slate-50 pl-10 pr-12 text-slate-950 shadow-none focus:border-[#a61b29] focus:shadow-[0_0_0_3px_rgba(166,27,41,0.12)] dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-rose-400"
                          placeholder="Enter your password"
                          autoComplete="current-password"
                          aria-invalid={Boolean(reloginError)}
                          aria-describedby={reloginError ? "session-resume-error" : undefined}
                          disabled={reloginLoading}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((visible) => !visible)}
                          className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a61b29] dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          title={showPassword ? "Hide password" : "Show password"}
                          disabled={reloginLoading}
                        >
                          {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {reloginError && (
                        <motion.div
                          id="session-resume-error"
                          role="alert"
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200"
                        >
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{reloginError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {recaptchaBlocking && (
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400" role="status">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                        Preparing secure sign-in...
                      </div>
                    )}

                    {recaptchaUnavailable && (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        <span>{recaptcha.error}</span>
                        <button
                          type="button"
                          onClick={recaptcha.retry}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-[#a61b29] transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a61b29] dark:text-rose-300 dark:hover:bg-rose-500/10"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Retry
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col gap-2.5 pt-1 sm:flex-row-reverse">
                      <Button
                        type="submit"
                        disabled={!password || reloginLoading || recaptchaBlocking || recaptchaUnavailable}
                        className="h-11 rounded-lg border-transparent bg-[#a61b29] text-white shadow-none hover:bg-[#8f1723] hover:shadow-none disabled:translate-y-0 sm:min-w-[190px] dark:bg-[#d63649] dark:hover:bg-[#bd2d3e]"
                      >
                        {reloginLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Restoring session...
                          </>
                        ) : recaptchaBlocking ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            Preparing sign-in...
                          </>
                        ) : (
                          <>
                            <LogIn className="h-4 w-4" aria-hidden="true" />
                            Resume session
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 rounded-lg border-slate-200 bg-transparent text-slate-700 shadow-none hover:bg-slate-100 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
                        onClick={logout}
                        disabled={reloginLoading}
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign out instead
                      </Button>
                    </div>
                  </form>
                </div>
              </motion.section>
            </div>
          </>
        )}
      </AnimatePresence>
      {isMobile && !sessionExpired && (
        <nav className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur px-2 pb-2 pt-1">
          <div className="flex items-stretch gap-1 overflow-x-auto">
            {mobileNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onMouseEnter={() => preloadRoute(item.to)}
                onFocus={() => preloadRoute(item.to)}
                className={({ isActive }) =>
                  `flex-shrink-0 min-w-[80px] flex-1 rounded-xl px-2 py-1.5 text-xs font-medium transition ${isActive
                    ? "bg-ink text-card shadow-soft"
                    : "text-mute hover:bg-accent/5"
                  }`
                }
              >
                {({ isActive }) => (
                  <div className="flex flex-col items-center gap-1">
                    <item.icon className={`h-5 w-5 ${isActive ? "" : "opacity-80"}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      {!sessionExpired && <TourOverlay />}
      {!user.must_change_password && !sessionExpired && (
        <ChatProvider>
          <ChatWidget />
        </ChatProvider>
      )}
    </div>
  );
}
