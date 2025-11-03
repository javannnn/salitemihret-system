import { NavLink, Outlet, Navigate } from "react-router-dom";
import { logout } from "@/lib/auth";
import { Card, Button, Badge } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";

const DEMO_EMAILS = [
  "pradmin@example.com",
  "registrar@example.com",
  "clerk@example.com"
];

export default function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6 text-sm text-mute">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-bg text-ink grid lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-black/5 bg-white p-6 flex flex-col gap-6">
        <div>
          <div className="text-xl font-semibold">SaliteOne</div>
          <div className="text-xs text-mute">Demo Console</div>
        </div>
        <nav className="space-y-2 text-sm">
          <NavLink to="/dashboard" className={({ isActive }) => `block px-2 py-1 rounded-xl ${isActive ? "bg-ink text-white" : "hover:bg-black/5"}`}>
            Dashboard
          </NavLink>
          <NavLink to="/members" className={({ isActive }) => `block px-2 py-1 rounded-xl ${isActive ? "bg-ink text-white" : "hover:bg-black/5"}`}>
            Members
          </NavLink>
        </nav>
        <Card className="p-4 space-y-2 text-sm">
          <div className="font-medium">Demo Accounts</div>
          <ul className="text-xs space-y-1 text-mute">
            {DEMO_EMAILS.map((email) => (
              <li key={email}>{email}</li>
            ))}
          </ul>
          <div className="text-xs text-mute">Password: <strong>Demo123!</strong></div>
          <Button className="w-full text-sm" onClick={logout}>Sign out</Button>
        </Card>
      </aside>
      <main className="p-6 lg:p-10 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-mute">Signed in as</div>
            <div className="text-lg font-semibold">{user.full_name || user.user}</div>
          </div>
          <div className="flex items-center gap-2">
            {user.roles.map((role) => (
              <Badge key={role}>{role}</Badge>
            ))}
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
