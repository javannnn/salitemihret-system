import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ roles, children }: { roles?: string[]; children: React.ReactNode }) {
  const { user, loading, refresh } = useAuth();
  const [checked, setChecked] = useState(false);
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    if (user) {
      setChecked(true);
      return;
    }

    if (localStorage.getItem("access_token")) {
      refresh().finally(() => setChecked(true));
    } else {
      setChecked(true);
    }
  }, [loading, user, refresh]);

  if (loading || !checked) {
    return <div className="p-6 text-sm text-mute">Loading…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && roles.length > 0 && !roles.some((role) => user.roles.includes(role))) {
    return <div className="p-6 text-sm text-mute">Not authorized for this section.</div>;
  }

  return <>{children}</>;
}
