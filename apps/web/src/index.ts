export { RBACProvider, useRBACContext } from "./context/RBACContext";
export { useRBAC } from "./hooks/useRBAC";
export { RoleGate } from "./components/RoleGate";
export { ProtectedRoute } from "./components/ProtectedRoute";
export { fetchWhoAmI, whoAmIMethod } from "./api/client";
export { PRAdminDemoRoute } from "./routes/PRAdminDemoRoute";
export type { Role, RoleCheck } from "./types/rbac";
