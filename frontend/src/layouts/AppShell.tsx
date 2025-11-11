import { useEffect, useMemo, useState, useCallback } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, ChevronDown, ShieldAlert } from "lucide-react";

import { logout } from "@/lib/auth";
import { Card, Button, Badge, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { usePermissions } from "@/hooks/usePermissions";
import { BetaBadge } from "@/components/BetaTag";
import { useToast } from "@/components/Toast";
import { activateLicense, ApiError, getLicenseStatus, LicenseStatusResponse } from "@/lib/api";

export default function AppShell() {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const permissions = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const toast = useToast();
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatusResponse | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseToken, setLicenseToken] = useState("");
  const [licenseSubmitting, setLicenseSubmitting] = useState(false);

  const navItems = useMemo(() => {
    const items = [
      { label: "Dashboard", to: "/dashboard", visible: true },
      { label: "Members", to: "/members", visible: permissions.viewMembers },
      { label: "Payments", to: "/payments", visible: permissions.viewPayments },
    ];
    return items.filter((item) => item.visible);
  }, [permissions.viewMembers, permissions.viewPayments]);

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
      ? "border-red-300 bg-red-50 text-red-900"
      : licenseIntent === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-emerald-300 bg-emerald-50 text-emerald-900";

  return (
    <div className="min-h-screen bg-bg text-ink lg:grid lg:grid-cols-[260px_1fr] transition-colors">
      <aside className="border-r border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-xl font-semibold tracking-tight">SaliteOne</div>
            <BetaBadge subtle />
          </div>
          <div className="text-xs text-mute">Membership Console</div>
        </div>
        <nav className="space-y-2 text-sm">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  "block px-3 py-2 rounded-xl transition",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-soft"
                    : "hover:bg-accent/10 hover:text-accent",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Button className="w-full text-sm" onClick={logout}>
          Sign out
        </Button>
      </aside>
      <main className="relative">
        <div className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur px-6 lg:px-10 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="text-xs uppercase tracking-wide text-mute">Signed in as</div>
            <div className="text-lg font-semibold">{user.full_name || user.user}</div>
          </div>
          <BetaBadge />
          <div className="flex items-center gap-3">
            <button
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:border-accent/50 hover:bg-accent/10 transition"
              aria-label="Toggle theme"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="relative">
              <Button variant="ghost" className="flex items-center gap-2" onClick={() => setMenuOpen((prev) => !prev)}>
                <span className="text-sm font-medium">{user.user}</span>
                <ChevronDown size={16} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
              </Button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 min-w-[200px] rounded-xl border border-border bg-card shadow-soft p-3 space-y-2"
                  >
                    <div className="text-xs text-mute uppercase">Roles</div>
                    <div className="flex flex-wrap gap-2">
                      {user.roles.map((role) => (
                        <Badge key={role} className="normal-case">
                          {role}
                        </Badge>
                      ))}
                    </div>
                    <Button
                      variant="soft"
                      className="w-full text-sm mt-2"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                    >
                      Log out
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
        <div className="px-6 lg:px-10 py-4 space-y-4">
          {licenseStatus && (
            <Card className={`p-4 border ${licenseClasses}`}>
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
                </div>
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
                <div className="flex flex-wrap items-center gap-2">
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
    </div>
  );
}
