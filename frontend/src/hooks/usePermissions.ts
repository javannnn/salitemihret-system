import { useMemo } from "react";

import { useAuth } from "@/context/AuthContext";

export type ReportPermissionKey =
  | "overview"
  | "members"
  | "payments"
  | "sponsorships"
  | "newcomers"
  | "schools";

export type PermissionMap = {
  viewMembers: boolean;
  createMembers: boolean;
  editCore: boolean;
  editStatus: boolean;
  editFinance: boolean;
  editSpiritual: boolean;
  bulkActions: boolean;
  importMembers: boolean;
  exportMembers: boolean;
  viewAudit: boolean;
  viewPromotions: boolean;
  runPromotions: boolean;
  viewPayments: boolean;
  managePayments: boolean;
  viewSponsorships: boolean;
  manageSponsorships: boolean;
  viewNewcomers: boolean;
  manageNewcomers: boolean;
  viewVolunteers: boolean;
  manageVolunteers: boolean;
  viewSchools: boolean;
  manageSchools: boolean;
};

const BASE_PERMISSIONS: PermissionMap = {
  viewMembers: false,
  createMembers: false,
  editCore: false,
  editStatus: false,
  editFinance: false,
  editSpiritual: false,
  bulkActions: false,
  importMembers: false,
  exportMembers: false,
  viewAudit: false,
  viewPromotions: false,
  runPromotions: false,
  viewPayments: false,
  managePayments: false,
  viewSponsorships: false,
  manageSponsorships: false,
  viewNewcomers: false,
  manageNewcomers: false,
  viewVolunteers: false,
  manageVolunteers: false,
  viewSchools: false,
  manageSchools: false,
};

const ROLE_RULES: Record<string, Partial<PermissionMap>> = {
  Admin: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    editStatus: true,
    editFinance: true,
    editSpiritual: true,
    bulkActions: true,
    importMembers: true,
    exportMembers: true,
    viewAudit: true,
    viewPromotions: true,
    runPromotions: true,
    viewPayments: true,
    managePayments: true,
    viewSponsorships: true,
    manageSponsorships: true,
    viewNewcomers: true,
    manageNewcomers: true,
    viewVolunteers: true,
    manageVolunteers: true,
    viewSchools: true,
    manageSchools: true,
  },
  PublicRelations: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    editStatus: true,
    editFinance: true,
    editSpiritual: true,
    bulkActions: true,
    importMembers: true,
    exportMembers: true,
    viewAudit: true,
    viewPromotions: true,
    runPromotions: true,
    viewSponsorships: true,
    viewNewcomers: true,
    manageNewcomers: true,
    viewVolunteers: true,
    manageVolunteers: true,
    viewSchools: true,
    manageSchools: true,
  },
  Registrar: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    editSpiritual: true,
    viewAudit: true,
    exportMembers: true,
    viewNewcomers: true,
    manageNewcomers: true,
    viewVolunteers: true,
    viewSchools: true,
  },
  Clerk: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    viewVolunteers: true,
  },
  OfficeAdmin: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    viewPayments: true,
    viewSponsorships: true,
    viewNewcomers: true,
    viewVolunteers: true,
    viewSchools: true,
  },
  FinanceAdmin: {
    viewMembers: true,
    editFinance: true,
    exportMembers: true,
    viewPayments: true,
    managePayments: true,
    viewSponsorships: true,
    viewVolunteers: true,
    viewSchools: true,
  },
  SponsorshipCommittee: {
    viewMembers: true,
    viewSponsorships: true,
    manageSponsorships: true,
    viewNewcomers: true,
    manageNewcomers: true,
    viewVolunteers: true,
    viewSchools: true,
  },
  SchoolAdmin: {
    viewMembers: true,
    viewSchools: true,
    manageSchools: true,
    viewPayments: true,
  },
};

export function usePermissions(): PermissionMap & {
  hasRole: (role: string) => boolean;
  isSuperAdmin: boolean;
  modules: Record<string, { read: boolean; write: boolean; visible: boolean }>;
  isModuleVisible: (module: string) => boolean;
  canReadField: (module: string, field: string) => boolean;
  canWriteField: (module: string, field: string) => boolean;
  canAccessReport: (report: ReportPermissionKey) => boolean;
} {
  const { user } = useAuth();

  return useMemo(() => {
    const roles = user?.roles ?? [];
    const isSuperAdmin = Boolean(user?.is_super_admin);
    const rawModules = user?.permissions?.modules ?? {};
    const fields = user?.permissions?.fields ?? {};
    const legacy = user?.permissions?.legacy;
    const merged: PermissionMap = { ...BASE_PERMISSIONS };
    const modules = Object.fromEntries(
      Object.entries(rawModules).map(([module, flags]) => [
        module,
        {
          read: Boolean(flags.read),
          write: Boolean(flags.write),
          visible: Boolean((flags as { visible?: boolean }).visible ?? flags.read ?? flags.write),
        },
      ])
    ) as Record<string, { read: boolean; write: boolean; visible: boolean }>;

    if (isSuperAdmin) {
      Object.keys(merged).forEach((key) => {
        (merged as Record<string, boolean>)[key] = true;
      });
    } else if (legacy) {
      for (const key of Object.keys(BASE_PERMISSIONS)) {
        if (typeof legacy[key] === "boolean") {
          (merged as Record<string, boolean>)[key] = legacy[key];
        }
      }
    } else {
      // Backward-compatible fallback if backend snapshot is missing.
      roles.forEach((role) => {
        const overrides = ROLE_RULES[role];
        if (!overrides) {
          return;
        }
        for (const [key, value] of Object.entries(overrides)) {
          if (value) {
            (merged as Record<string, boolean>)[key] = true;
          }
        }
      });

      // Viewing members is allowed if any recognized capability toggled
      if (!merged.viewMembers && roles.length > 0) {
        merged.viewMembers = roles.some((role) => ROLE_RULES[role]?.viewMembers);
      }
    }

    const canReadField = (module: string, field: string) => {
      if (isSuperAdmin) return true;
      if (!modules[module]?.read) return false;
      const entry = fields[module]?.[field];
      if (!entry) return true;
      return Boolean(entry.read);
    };

    const canWriteField = (module: string, field: string) => {
      if (isSuperAdmin) return true;
      if (!modules[module]?.write) return false;
      const entry = fields[module]?.[field];
      if (!entry) return true;
      return Boolean(entry.write);
    };

    const isModuleVisible = (module: string) => {
      if (isSuperAdmin) return true;
      const entry = modules[module];
      if (!entry) return false;
      return Boolean(entry.visible ?? entry.read ?? entry.write);
    };

    const canAccessReport = (report: ReportPermissionKey) => canReadField("reports", report);

    return {
      ...merged,
      isSuperAdmin,
      modules,
      isModuleVisible,
      canReadField,
      canWriteField,
      canAccessReport,
      hasRole: (role: string) => roles.includes(role) || isSuperAdmin,
    };
  }, [user]);
}
