import { useCallback } from "react";

import type { Role, RoleCheck } from "../types/rbac";
import { useRBACContext } from "../context/RBACContext";

export const useRBAC = () => {
  const { roles, setRoles, hasRole, isAuthorized } = useRBACContext();

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
    hasRole,
    isAuthorized,
    grantRole,
    revokeRole,
    setRoles,
  };
};

export type { Role, RoleCheck } from "../types/rbac";
