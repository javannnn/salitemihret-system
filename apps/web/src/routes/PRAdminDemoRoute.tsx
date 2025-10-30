import React from "react";

import { RoleGate } from "../components/RoleGate";

export const PRAdminDemoRoute: React.FC = () => {
  return (
    <RoleGate allow={["PR Administrator"]} loadingFallback={<p>Loading RBAC…</p>} fallback={<p>Access denied.</p>}>
      <section className="space-y-2 p-4">
        <h1 className="text-xl font-semibold">PR Administrator Area</h1>
        <p className="text-sm text-muted-foreground">
          Only PR Administrators should see this guarded content. Use this route as a wiring example when integrating
          TanStack Query + RBACProvider in the main admin shell.
        </p>
      </section>
    </RoleGate>
  );
};

export default PRAdminDemoRoute;
