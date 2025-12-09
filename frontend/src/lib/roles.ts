export const ROLE_OPTIONS = [
  "SuperAdmin",
  "Admin",
  "PublicRelations",
  "Registrar",
  "Clerk",
  "OfficeAdmin",
  "FinanceAdmin",
  "SponsorshipCommittee",
  "SchoolAdmin",
] as const;

export const ROLE_LABELS: Record<string, string> = {
  SuperAdmin: "Super Admin (full access)",
  Admin: "Admin",
  PublicRelations: "Public Relations",
  Registrar: "Registrar",
  Clerk: "Clerk",
  OfficeAdmin: "Office Admin",
  FinanceAdmin: "Finance Admin",
  SponsorshipCommittee: "Sponsorship Committee",
  SchoolAdmin: "School Admin",
};
