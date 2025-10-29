import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { Role, RoleCheck } from "../types/rbac";

export interface RBACContextValue {
  roles: Role[];
  setRoles: (roles: Role[]) => void;
  hasRole: (role: Role | Role[]) => boolean;
  isAuthorized: (check: RoleCheck) => boolean;
}

const RBACContext = createContext<RBACContextValue | undefined>(undefined);

export interface RBACProviderProps {
  initialRoles?: Role[];
  children: ReactNode;
}

export const RBACProvider: React.FC<RBACProviderProps> = ({ initialRoles = [], children }) => {
  const [roles, setRoles] = useState<Role[]>(() => Array.from(new Set(initialRoles)));

  const hasRole = useCallback(
    (input: Role | Role[]) => {
      const required = Array.isArray(input) ? input : [input];
      return required.some((role) => roles.includes(role));
    },
    [roles]
  );

  const isAuthorized = useCallback(
    (check: RoleCheck) => {
      if (check.requireAll && check.requireAll.length > 0) {
        const ok = check.requireAll.every((role) => roles.includes(role));
        if (!ok) {
          return false;
        }
      }

      if (check.anyOf && check.anyOf.length > 0) {
        return check.anyOf.some((role) => roles.includes(role));
      }

      if (check.requireOneOf && check.requireOneOf.length > 0) {
        return check.requireOneOf.some((role) => roles.includes(role));
      }

      if (check.requireNone && check.requireNone.some((role) => roles.includes(role))) {
        return false;
      }

      return true;
    },
    [roles]
  );

  const value = useMemo<RBACContextValue>(
    () => ({ roles, setRoles, hasRole, isAuthorized }),
    [roles, hasRole, isAuthorized]
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
