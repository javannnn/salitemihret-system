import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({
  roles,
  requireSuperAdmin = false,
  children,
}: {
  roles?: string[];
  requireSuperAdmin?: boolean;
  children: React.ReactNode;
}) {
  const { user, token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-6 text-sm text-mute">Loading…</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user) {
    return <div className="p-6 text-sm text-mute">Loading session…</div>;
  }

  if (requireSuperAdmin && !user.is_super_admin) {
    return <div className="p-6 text-sm text-mute">Not authorized for this section.</div>;
  }

  if (roles && roles.length > 0 && !roles.some((role) => user.roles.includes(role))) {
    return <div className="p-6 text-sm text-mute">Not authorized for this section.</div>;
  }

  return <>{children}</>;
}
