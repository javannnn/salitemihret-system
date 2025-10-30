import React from "react";
import type { ReactNode } from "react";

import type { Role, RoleCheck } from "../types/rbac";
import { useRBAC } from "../hooks/useRBAC";

export interface RoleGateProps {
  allow?: Role[];
  roles?: Role[];
  forbid?: Role[];
  check?: RoleCheck;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  children: ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({ allow, roles, forbid, check, fallback = null, loadingFallback = null, children }) => {
  const { isAuthorized, hasRole, isLoading } = useRBAC();

  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  if (forbid && forbid.some((role) => hasRole(role))) {
    return <>{fallback}</>;
  }

  const whitelist = allow ?? roles;

  if (whitelist && whitelist.length > 0) {
    const ok = isAuthorized({ anyOf: whitelist });
    if (!ok) {
      return <>{fallback}</>;
    }
  }

  if (check && !isAuthorized(check)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default RoleGate;
