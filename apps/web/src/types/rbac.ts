export type Role =
  | "Parish Registrar"
  | "PR Administrator"
  | "Finance Clerk"
  | "Media Coordinator"
  | "Sunday School Lead"
  | "Volunteer Coordinator"
  | "Council Secretary"
  | "System Operator";

export interface RoleCheck {
  anyOf?: Role[];
  requireAll?: Role[];
  requireNone?: Role[];
  requireOneOf?: Role[];
}
