import { useCallback } from "react";

import type { Role, RoleCheck } from "../types/rbac";
import { useRBACContext } from "../context/RBACContext";

export const useRBAC = () => {
  const { roles, personas, isLoading, setRoles, resetRoles, hasRole, isAuthorized } = useRBACContext();

  const grantRole = useCallback(
    (role: Role) => {
      setRoles(Array.from(new Set([...roles, role])));
    },
    [roles, setRoles]
  );

  const revokeRole = useCallback(
    (role: Role) => {
      setRoles(roles.filter((candidate) => candidate !== role));
    },
    [roles, setRoles]
  );

  return {
    roles,
    personas,
    isLoading,
    hasRole,
    isAuthorized,
    grantRole,
    revokeRole,
    setRoles,
    resetRoles,
  };
};

export type { Role, RoleCheck } from "../types/rbac";
