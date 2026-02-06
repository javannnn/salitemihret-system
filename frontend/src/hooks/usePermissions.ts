import { useMemo } from "react";

import { useAuth } from "@/context/AuthContext";

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

export function usePermissions(): PermissionMap & { hasRole: (role: string) => boolean; isSuperAdmin: boolean } {
  const { user } = useAuth();

  return useMemo(() => {
    const roles = user?.roles ?? [];
    const isSuperAdmin = Boolean(user?.is_super_admin);
    const merged: PermissionMap = { ...BASE_PERMISSIONS };
    if (isSuperAdmin) {
      Object.keys(merged).forEach((key) => {
        (merged as Record<string, boolean>)[key] = true;
      });
    }
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

    return {
      ...merged,
      isSuperAdmin,
      hasRole: (role: string) => roles.includes(role) || isSuperAdmin,
    };
  }, [user]);
}
