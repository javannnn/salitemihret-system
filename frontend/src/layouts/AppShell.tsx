import { useMemo, useState } from "react";
import { NavLink, Outlet, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun, ChevronDown } from "lucide-react";

import { logout } from "@/lib/auth";
import { Card, Button, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";

export default function AppShell() {
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = useMemo(
    () => [
      { label: "Dashboard", to: "/dashboard" },
      { label: "Members", to: "/members" },
    ],
    []
  );

  if (loading) {
    return <div className="p-6 text-sm text-mute">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink lg:grid lg:grid-cols-[260px_1fr] transition-colors">
      <aside className="border-r border-border bg-card/60 backdrop-blur-sm p-6 flex flex-col gap-6">
        <div className="space-y-1">
          <div className="text-xl font-semibold tracking-tight">SaliteOne</div>
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
          <div>
            <div className="text-xs uppercase tracking-wide text-mute">Signed in as</div>
            <div className="text-lg font-semibold">{user.full_name || user.user}</div>
          </div>
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
    </div>
  );
}
