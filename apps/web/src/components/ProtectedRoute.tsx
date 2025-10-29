import React from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import type { Role } from "../types/rbac";
import { useRBAC } from "../hooks/useRBAC";

export interface ProtectedRouteProps {
  allowedRoles?: Role[];
  fallbackPath?: string;
  loadingFallback?: ReactNode;
  children?: ReactNode;
  isLoading?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  allowedRoles,
  fallbackPath = "/login",
  loadingFallback = null,
  children,
  isLoading = false,
}) => {
  const { isAuthorized } = useRBAC();
  const location = useLocation();

  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const ok = isAuthorized({ anyOf: allowedRoles });
    if (!ok) {
      return <Navigate to={fallbackPath} replace state={{ from: location }} />;
    }
  }

  if (children) {
    return <>{children}</>;
  }

  return <Outlet />;
};

export default ProtectedRoute;
