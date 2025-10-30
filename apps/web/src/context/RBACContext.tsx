import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import type { Role, RoleCheck } from "../types/rbac";
import { fetchWhoAmI } from "../api/client";

export interface RBACContextValue {
  roles: Role[];
  personas: Role[];
  isLoading: boolean;
  setRoles: (roles: Role[]) => void;
  resetRoles: () => void;
  hasRole: (role: Role | Role[]) => boolean;
  isAuthorized: (check: RoleCheck) => boolean;
}

const RBACContext = createContext<RBACContextValue | undefined>(undefined);

export interface RBACProviderProps {
  initialRoles?: Role[];
  children: ReactNode;
}

export const RBACProvider: React.FC<RBACProviderProps> = ({ initialRoles = [], children }) => {
  const [overrideRoles, setOverrideRoles] = useState<Role[] | null>(
    initialRoles.length ? Array.from(new Set(initialRoles)) : null
  );

  const { data, isLoading } = useQuery({
    queryKey: ["whoami"],
    queryFn: fetchWhoAmI,
  });

  const fetchedRoles = useMemo(() => Array.from(new Set(data?.roles ?? [])), [data?.roles]);
  const resolvedRoles = overrideRoles ?? fetchedRoles;
  const personas = data?.personas ?? resolvedRoles;

  const setRoles = useCallback((next: Role[]) => {
    setOverrideRoles(Array.from(new Set(next)));
  }, []);

  const resetRoles = useCallback(() => {
    setOverrideRoles(null);
  }, []);

  const hasRole = useCallback(
    (input: Role | Role[]) => {
      const required = Array.isArray(input) ? input : [input];
      return required.some((role) => resolvedRoles.includes(role));
    },
    [resolvedRoles]
  );

  const isAuthorized = useCallback(
    (check: RoleCheck) => {
      if (check.requireAll && check.requireAll.length > 0) {
        const ok = check.requireAll.every((role) => resolvedRoles.includes(role));
        if (!ok) {
          return false;
        }
      }

      if (check.anyOf && check.anyOf.length > 0) {
        return check.anyOf.some((role) => resolvedRoles.includes(role));
      }

      if (check.requireOneOf && check.requireOneOf.length > 0) {
        return check.requireOneOf.some((role) => resolvedRoles.includes(role));
      }

      if (check.requireNone && check.requireNone.some((role) => resolvedRoles.includes(role))) {
        return false;
      }

      return true;
    },
    [resolvedRoles]
  );

  const value = useMemo<RBACContextValue>(
    () => ({ roles: resolvedRoles, personas, isLoading, setRoles, resetRoles, hasRole, isAuthorized }),
    [resolvedRoles, personas, isLoading, setRoles, resetRoles, hasRole, isAuthorized]
  );

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
};

export const useRBACContext = (): RBACContextValue => {
  const ctx = useContext(RBACContext);
  if (!ctx) {
    throw new Error("useRBACContext must be used within an RBACProvider");
  }
  return ctx;
};
