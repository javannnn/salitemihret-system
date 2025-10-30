import React from "react";
import type { ReactNode } from "react";

import type { Role, RoleCheck } from "../types/rbac";
import { useRBAC } from "../hooks/useRBAC";

export interface RoleGateProps {
  allow?: Role[];
  forbid?: Role[];
  check?: RoleCheck;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  children: ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({ allow, forbid, check, fallback = null, loadingFallback = null, children }) => {
  const { isAuthorized, hasRole, isLoading } = useRBAC();

  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  if (forbid && forbid.some((role) => hasRole(role))) {
    return <>{fallback}</>;
  }

  if (allow && allow.length > 0) {
    const ok = isAuthorized({ anyOf: allow });
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
