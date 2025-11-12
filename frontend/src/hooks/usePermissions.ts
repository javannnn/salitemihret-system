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
  },
  Clerk: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
  },
  OfficeAdmin: {
    viewMembers: true,
    createMembers: true,
    editCore: true,
    viewPayments: true,
    viewSponsorships: true,
    viewNewcomers: true,
  },
  FinanceAdmin: {
    viewMembers: true,
    editFinance: true,
    exportMembers: true,
    viewPayments: true,
    managePayments: true,
    viewSponsorships: true,
  },
  SponsorshipCommittee: {
    viewMembers: true,
    viewSponsorships: true,
    manageSponsorships: true,
    viewNewcomers: true,
    manageNewcomers: true,
  },
};

export function usePermissions(): PermissionMap & { hasRole: (role: string) => boolean } {
  const { user } = useAuth();

  return useMemo(() => {
    const roles = user?.roles ?? [];
    const merged: PermissionMap = { ...BASE_PERMISSIONS };
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
      hasRole: (role: string) => roles.includes(role),
    };
  }, [user]);
}
