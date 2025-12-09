import { useEffect, useMemo, useState, useCallback, lazy, Suspense } from "react";
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, ShieldAlert, User, ChevronLeft, ChevronRight, ChevronDown, LayoutDashboard, Users, CreditCard, HeartHandshake, GraduationCap, ShieldCheck, Loader2, Mail, BarChart3, Eye, EyeOff } from "lucide-react";

import { logout, login } from "@/lib/auth";
import { Card, Button, Badge, Textarea, Input } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { BetaBadge } from "@/components/BetaTag";
import { useToast } from "@/components/Toast";
import { activateLicense, ApiError, getLicenseStatus, LicenseStatusResponse } from "@/lib/api";
import { subscribeSessionExpired, resetSessionExpiryNotice } from "@/lib/session";
import { useTour } from "@/context/TourContext";
import { TourOverlay } from "@/components/Tour/TourOverlay";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ChatProvider } from "@/context/ChatContext";
import { ChatWidget } from "@/components/Chat/ChatWidget";
import { useRecaptcha } from "@/hooks/useRecaptcha";

const AccountProfile = lazy(() => import("@/pages/Account/Profile"));

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
  const [licenseToken, setLicenseToken] = useState("");
  const [licenseSubmitting, setLicenseSubmitting] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reloginLoading, setReloginLoading] = useState(false);
  const tour = useTour();
  const recaptcha = useRecaptcha();

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
    const canViewReports =
      permissions.viewMembers ||
      permissions.viewPayments ||
      permissions.viewSponsorships ||
      permissions.viewSchools;

    const items = [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, visible: true },
      { label: "Members", to: "/members", icon: Users, visible: permissions.viewMembers },
      { label: "Payments", to: "/payments", icon: CreditCard, visible: permissions.viewPayments },
      {
        label: "Sponsorships",
        to: "/sponsorships",
        icon: HeartHandshake,
        visible: permissions.viewSponsorships || permissions.viewNewcomers,
      },
      {
        label: "Schools",
        to: "/schools",
        icon: GraduationCap,
        visible: permissions.viewSchools,
      },
      {
        label: "Reports",
        to: "/admin/reports",
        icon: BarChart3,
        visible: canViewReports
      },
      { label: "User Management", to: "/admin/users", icon: ShieldCheck, visible: isSuperAdmin },
      { label: "Email", to: "/admin/email", icon: Mail, visible: isSuperAdmin },
    ];
    return items.filter((item) => item.visible);
  }, [
    isSuperAdmin,
    permissions.viewMembers,
    permissions.viewPayments,
    permissions.viewSponsorships,
    permissions.viewNewcomers,
    permissions.viewSchools,
  ]);

  const mobileNavItems = useMemo(() => (navItems.length ? navItems : [{ label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, visible: true }]), [navItems]);

  const activeNavItem = useMemo(
    () => navItems.find((item) => location.pathname.startsWith(item.to)),
    [location.pathname, navItems]
  );

  const [licenseCollapsed, setLicenseCollapsed] = useState(false);
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
    if (!user) {
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
    const unsubscribe = subscribeSessionExpired(() => setSessionExpired(true));
    return unsubscribe;
  }, []);

  useEffect(() => {
    setSessionExpired(false);
  }, [user]);

  useEffect(() => {
    setLicenseCollapsed(isMobile);
  }, [isMobile]);

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
                className="flex flex-col overflow-hidden whitespace-nowrap"
              >
                <div className="text-xl font-bold tracking-tight logo-shimmer">SaliteOne</div>
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
                <div className="hidden lg:block">
                  <BetaBadge />
                </div>
              </div>
            </div>
            <div className="lg:hidden">
              <BetaBadge subtle />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              data-tour="theme-toggle"
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:border-accent/50 hover:bg-accent/10 transition overflow-hidden"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              whileTap={{ scale: 0.95 }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={theme}
                  initial={{ y: -20, opacity: 0, rotate: -90 }}
                  animate={{ y: 0, opacity: 1, rotate: 0 }}
                  exit={{ y: 20, opacity: 0, rotate: 90 }}
                  transition={{ duration: 0.2 }}
                >
                  {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
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
                {isSuperAdmin && (
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
        <div className="px-6 lg:px-10 py-4 space-y-4">
          {licenseStatus && (
            <Card data-tour="license-banner" className={`p-4 border ${licenseClasses}`}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlert size={18} />
                  <span>
                    {licenseStatus.state === "active"
                      ? "License active"
                      : licenseStatus.state === "trial"
                        ? "Trial mode"
                        : "License required"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLicenseCollapsed((prev) => !prev)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] uppercase tracking-wide text-mute transition hover:bg-accent/5 lg:hidden"
                    aria-expanded={!licenseCollapsed}
                  >
                    {licenseCollapsed ? "Details" : "Hide"}
                    <ChevronDown className={`h-3 w-3 transition-transform ${licenseCollapsed ? "" : "rotate-180"}`} />
                  </button>
                </div>
                <div className={`${licenseCollapsed ? "hidden lg:block" : ""}`}>
                  <p className="text-sm">
                    {licenseStatus.message}{" "}
                    {licenseStatus.expires_at && (
                      <span>
                        Expires{" "}
                        <strong>{new Date(licenseStatus.expires_at).toLocaleDateString()}</strong>.
                      </span>
                    )}
                    {licenseStatus.days_remaining >= 0 && (
                      <span className="ml-1">
                        {licenseStatus.days_remaining} day{licenseStatus.days_remaining === 1 ? "" : "s"} remaining.
                      </span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide">
                      Mode: {licenseStatus.state.toUpperCase()}
                    </span>
                    {licenseStatus.customer && (
                      <span className="text-xs uppercase tracking-wide">
                        Licensed to: {licenseStatus.customer}
                      </span>
                    )}
                    {licenseLoading && <span className="text-xs text-mute">Refreshing…</span>}
                    {canManageLicense && (
                      <Button
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setLicenseModalOpen(true)}
                      >
                        {licenseStatus.state === "active" ? "Update license" : "Install license"}
                      </Button>
                    )}
                    <Button variant="ghost" className="text-xs" onClick={refreshLicense}>
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
        <section className="px-6 lg:px-10 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
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
              <Button variant="ghost" onClick={() => setLicenseModalOpen(false)}>
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
              <Button variant="ghost" onClick={() => setLicenseModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleLicenseActivate} disabled={licenseSubmitting}>
                {licenseSubmitting ? "Saving…" : "Activate license"}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <AnimatePresence>
        {sessionExpired && (
          <>
            <motion.div
              className="fixed inset-0 z-[100] bg-ink/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed inset-0 z-[101] flex items-center justify-center px-6"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
            >
              <Card className="max-w-md w-full p-6 space-y-6 border border-amber-300 bg-amber-50/95 text-amber-900 shadow-2xl">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                    <ShieldAlert className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-amber-900">Session Expired</h3>
                    <p className="text-sm text-amber-800/80">Please sign in again to continue working.</p>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!password) return;
                    setReloginLoading(true);
                    let token: string | undefined;
                    if (recaptcha.siteKey) {
                      try {
                        token = await recaptcha.execute("login");
                      } catch (err) {
                        console.error("reCAPTCHA failed", err);
                        toast.push("Verification failed. Please retry.", "error");
                        setReloginLoading(false);
                        return;
                      }
                    }

                    try {
                      await login(user?.user || "", password, token);
                      resetSessionExpiryNotice();
                      setSessionExpired(false);
                      setPassword("");
                      toast.push("Session restored", "info");
                    } catch (error) {
                      console.error(error);
                      toast.push("Invalid password", "error");
                    } finally {
                      setReloginLoading(false);
                    }
                  }}
                  className="space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-amber-800/70">
                      Account
                    </label>
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-100/50 border border-amber-200/50">
                      <div className="h-8 w-8 rounded-full bg-amber-200 flex items-center justify-center text-amber-800 font-bold text-xs">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-amber-900 truncate">
                          {user?.full_name || user?.username}
                        </div>
                        <div className="text-xs text-amber-700 truncate">{user?.user}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-amber-800/70">
                        Password
                      </label>
                    </div>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-white/80 border-amber-200 focus:border-amber-400 focus:ring-amber-400/20 pr-10"
                        placeholder="Enter your password"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-800/60 hover:text-amber-900 transition-colors focus:outline-none"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1 border-amber-200 hover:bg-amber-100/50 text-amber-900"
                      onClick={logout}
                    >
                      Sign out
                    </Button>
                    <Button
                      type="submit"
                      disabled={!password || reloginLoading}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white border-transparent shadow-lg shadow-amber-900/10"
                    >
                      {reloginLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Signing in...
                        </>
                      ) : (
                        "Resume Session"
                      )}
                    </Button>
                  </div>
                </form>
              </Card>
            </motion.div>
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
      <TourOverlay />
      <ChatProvider>
        <ChatWidget />
      </ChatProvider>
    </div>
  );
}
