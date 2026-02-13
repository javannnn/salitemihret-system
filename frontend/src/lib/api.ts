import { notifySessionExpired, waitForSessionRestored } from "@/lib/session";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type ApiCapabilities = {
  supportsStaff: boolean;
  supportsSponsorContext: boolean;
  supportsSubmittedStatus: boolean;
};

let apiCapabilitiesPromise: Promise<ApiCapabilities> | null = null;

export async function getApiCapabilities(): Promise<ApiCapabilities> {
  if (apiCapabilitiesPromise) return apiCapabilitiesPromise;
  apiCapabilitiesPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/openapi.json`, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        return { supportsStaff: true, supportsSponsorContext: true, supportsSubmittedStatus: true };
      }
      const payload = (await response.json()) as {
        paths?: Record<string, unknown>;
        components?: {
          schemas?: {
            SponsorshipCreate?: {
              properties?: {
                status?: {
                  enum?: string[];
                };
              };
            };
          };
        };
      };
      const paths = payload.paths ?? {};
      const supportsStaff = Boolean(paths["/staff"] || paths["/staff/"]);
      const supportsSponsorContext = Boolean(paths["/sponsorships/sponsors/{member_id}/context"]);
      const statusEnum = payload.components?.schemas?.SponsorshipCreate?.properties?.status?.enum;
      const supportsSubmittedStatus = Array.isArray(statusEnum) ? statusEnum.includes("Submitted") : true;
      return { supportsStaff, supportsSponsorContext, supportsSubmittedStatus };
    } catch {
      return { supportsStaff: true, supportsSponsorContext: true, supportsSubmittedStatus: true };
    }
  })();
  return apiCapabilitiesPromise;
}

export type MemberStatus = "Active" | "Inactive" | "Pending" | "Archived";

export type Tag = { id: number; name: string; slug: string };
export type Ministry = { id: number; name: string; slug: string };
export type Household = {
  id: number;
  name: string;
  head_member_id: number | null;
  head_member_name?: string | null;
  members_count: number;
};
export type HouseholdMember = {
  id: number;
  first_name: string;
  last_name: string;
};
export type HouseholdDetail = Household & {
  members: HouseholdMember[];
};
export type HouseholdListResponse = {
  items: Household[];
  total: number;
  page: number;
  page_size: number;
};
export type Priest = { id: number; full_name: string; phone?: string | null; email?: string | null; status: string };
export type Spouse = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  gender?: string | null;
  country_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
};
export type SpousePayload = {
  first_name: string;
  last_name: string;
  gender?: string | null;
  country_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
};
export type Child = {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  gender?: string | null;
  birth_date?: string | null;
  country_of_birth?: string | null;
  notes?: string | null;
};

export type Member = {
  id: number;
  username: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  status: MemberStatus;
  gender?: string | null;
  birth_date?: string | null;
  marital_status?: string | null;
  baptismal_name?: string | null;
  district?: string | null;
  phone: string;
  email?: string | null;
  avatar_path?: string | null;
  address?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_region?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
  is_tither: boolean;
  pays_contribution: boolean;
  contribution_method?: string | null;
  contribution_amount?: number | null;
  contribution_currency: string;
  contribution_exception_reason?: string | null;
  contribution_exception_attachment_path?: string | null;
  notes?: string | null;
  family_count: number;
  household_size_override?: number | null;
  has_father_confessor: boolean;
  status_override?: boolean;
  status_override_value?: MemberStatus | null;
  status_override_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type MemberSundaySchoolParticipantStatus = "Up to date" | "Overdue" | "No payments yet" | "Not contributing";

export type MemberSundaySchoolParticipant = {
  id: number;
  first_name: string;
  last_name: string;
  member_username: string;
  category: SundaySchoolCategory | string;
  pays_contribution: boolean;
  monthly_amount?: number | null;
  payment_method?: string | null;
  last_payment_at?: string | null;
  status: MemberSundaySchoolParticipantStatus;
};

export type MemberSundaySchoolPayment = {
  id: number;
  amount: number;
  currency: string;
  method?: string | null;
  memo?: string | null;
  posted_at: string;
  status: Payment["status"];
  service_type_label: string;
};

export type MembershipHealth = {
  effective_status: MemberStatus;
  auto_status: MemberStatus;
  override_active: boolean;
  override_reason?: string | null;
  last_paid_at?: string | null;
  next_due_at?: string | null;
  days_until_due?: number | null;
  overdue_days?: number | null;
  consecutive_months: number;
  required_consecutive_months: number;
};

export type MembershipEvent = {
  timestamp: string;
  type: "Renewal" | "Overdue" | "Override";
  label: string;
  description?: string | null;
};

export type MemberDetail = Member & {
  birth_date?: string | null;
  join_date?: string | null;
  household?: Household | null;
  spouse?: Spouse | null;
  children: Child[];
  tags: Tag[];
  ministries: Ministry[];
  father_confessor?: Priest | null;
  contribution_history: ContributionPayment[];
  sunday_school_participants: MemberSundaySchoolParticipant[];
  sunday_school_payments: MemberSundaySchoolPayment[];
  membership_health: MembershipHealth;
  membership_events: MembershipEvent[];
};

export type MemberSummary = {
  id: number;
  first_name: string;
  last_name: string;
};

export type MemberChildSearchItem = {
  child_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  gender?: string | null;
  birth_date?: string | null;
  parent_member_id: number;
  parent_username: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_email?: string | null;
  parent_phone?: string | null;
};

export type MemberDuplicateMatch = {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  reason: string;
};

export type ContributionPayment = {
  id: number;
  amount: number;
  currency: string;
  paid_at: string;
  method?: string | null;
  note?: string | null;
  recorded_by_id?: number | null;
  created_at: string;
};

export type PaymentServiceType = {
  id: number;
  code: string;
  label: string;
  description?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentMember = {
  id: number;
  first_name: string;
  last_name: string;
  email?: string | null;
};

export type PaymentHousehold = {
  id: number;
  name: string;
};

export type Payment = {
  id: number;
  amount: number;
  currency: string;
  method?: string | null;
  memo?: string | null;
  posted_at: string;
  due_date?: string | null;
  status: "Pending" | "Completed" | "Overdue";
  member_id?: number | null;
  household_id?: number | null;
  recorded_by_id?: number | null;
  correction_of_id?: number | null;
  correction_reason?: string | null;
  created_at: string;
  updated_at: string;
  service_type: PaymentServiceType;
  member?: PaymentMember | null;
  household?: PaymentHousehold | null;
};

export type PaymentListResponse = {
  items: Payment[];
  total: number;
  page: number;
  page_size: number;
};

export type PaymentSummaryItem = {
  service_type_code: string;
  service_type_label: string;
  total_amount: number;
  currency: string;
};

export type PaymentSummaryResponse = {
  items: PaymentSummaryItem[];
  grand_total: number;
};

export type ReportActivityItem = {
  id: string;
  category: "promotion" | "member" | "sponsorship" | "user";
  action: string;
  actor?: string | null;
  target?: string | null;
  detail?: string | null;
  occurred_at: string;
  entity_type?: string | null;
  entity_id?: number | null;
};

export type AdminUserMemberSummary = {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
  linked_user_id?: number | null;
  linked_username?: string | null;
};

export type AdminUserSummary = {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  is_active: boolean;
  is_super_admin: boolean;
  roles: string[];
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
  member?: AdminUserMemberSummary | null;
};

export type AdminUserListResponse = {
  items: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
  total_active: number;
  total_inactive: number;
  total_linked: number;
  total_unlinked: number;
};

export type AdminUserAuditEntry = {
  id: number;
  action: string;
  actor_email?: string | null;
  actor_name?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

export type InvitationCreatePayload = {
  email: string;
  full_name?: string;
  username?: string;
  roles?: string[];
  member_id?: number;
  message?: string;
};

export type InvitationResponse = {
  id: number;
  email: string;
  username: string;
  expires_at: string;
  token: string;
};

export type AccountMemberSummary = {
  id: number;
  first_name: string;
  last_name: string;
  status?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type AccountProfile = {
  email: string;
  username: string;
  full_name?: string | null;
  roles: string[];
  is_super_admin: boolean;
  member?: AccountMemberSummary | null;
  can_change_username: boolean;
  next_username_change_at?: string | null;
};

export type StaffSummary = {
  id: number;
  email: string;
  username: string;
  full_name?: string | null;
  roles: string[];
};

export type StaffListResponse = {
  items: StaffSummary[];
  total: number;
};

export type SponsorshipProgram =
  | "Education"
  | "Nutrition"
  | "Healthcare"
  | "Housing"
  | "EmergencyRelief"
  | "SpecialProjects"
  | "Youth Scholarship";
export type SponsorshipPledgeChannel = "InPerson" | "OnlinePortal" | "Phone" | "EventBooth";
export type SponsorshipReminderChannel = "Email" | "SMS" | "Phone" | "WhatsApp";
export type SponsorshipMotivation =
  | "HonorMemorial"
  | "CommunityOutreach"
  | "Corporate"
  | "ParishInitiative"
  | "Other";
export type SponsorshipNotesTemplate = "FollowUp" | "PaymentIssue" | "Gratitude" | "Escalation";

export type SponsorshipBudgetRoundSummary = {
  id: number;
  year: number;
  round_number: number;
  start_date?: string | null;
  end_date?: string | null;
  slot_budget: number;
};

export type Sponsorship = {
  id: number;
  sponsor: MemberSummary;
  beneficiary_member?: MemberSummary | null;
  newcomer?: { id: number; first_name: string; last_name: string; status: string } | null;
  beneficiary_name: string;
  father_of_repentance_id?: number | null;
  father_of_repentance_name?: string | null;
  volunteer_services: string[];
  volunteer_service_other?: string | null;
  payment_information?: string | null;
  last_sponsored_date?: string | null;
  days_since_last_sponsorship?: number | null;
  frequency: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Active" | "Suspended" | "Completed" | "Closed";
  monthly_amount: number;
  received_amount: number;
  program?: SponsorshipProgram | null;
  pledge_channel?: SponsorshipPledgeChannel | null;
  reminder_channel?: SponsorshipReminderChannel | null;
  motivation?: SponsorshipMotivation | null;
  start_date: string;
  end_date?: string | null;
  last_status?: "Approved" | "Rejected" | "Pending" | null;
  last_status_reason?: string | null;
  budget_month?: number | null;
  budget_year?: number | null;
  budget_round_id?: number | null;
  budget_slots?: number | null;
  budget_round?: SponsorshipBudgetRoundSummary | null;
  used_slots: number;
  budget_utilization_percent?: number | null;
  budget_over_capacity: boolean;
  notes?: string | null;
  notes_template?: SponsorshipNotesTemplate | null;
  reminder_last_sent?: string | null;
  reminder_next_due?: string | null;
  assigned_staff_id?: number | null;
  submitted_at?: string | null;
  submitted_by_id?: number | null;
  approved_at?: string | null;
  approved_by_id?: number | null;
  rejected_at?: string | null;
  rejected_by_id?: number | null;
  rejection_reason?: string | null;
  sponsor_status?: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorshipFilters = {
  status?: string;
  program?: string;
  sponsor_id?: number;
  newcomer_id?: number;
  frequency?: string;
  beneficiary_type?: string;
  county?: string;
  assigned_staff_id?: number;
  budget_month?: number;
  budget_year?: number;
  budget_round_id?: number;
  page?: number;
  page_size?: number;
  q?: string;
  has_newcomer?: boolean;
  start_date?: string;
  end_date?: string;
  created_from?: string;
  created_to?: string;
};

export type SponsorshipPayload = {
  sponsor_member_id: number;
  beneficiary_member_id?: number;
  newcomer_id?: number;
  beneficiary_name?: string;
  father_of_repentance_id?: number;
  volunteer_services?: string[];
  volunteer_service_other?: string;
  payment_information?: string;
  last_sponsored_date?: string;
  monthly_amount: number;
  received_amount?: number;
  start_date: string;
  frequency: Sponsorship["frequency"];
  status: Sponsorship["status"];
  program?: SponsorshipProgram;
  pledge_channel?: SponsorshipPledgeChannel;
  reminder_channel?: SponsorshipReminderChannel;
  motivation?: SponsorshipMotivation;
  last_status?: Sponsorship["last_status"];
  last_status_reason?: string;
  budget_month?: number;
  budget_year?: number;
  budget_round_id?: number | null;
  budget_slots?: number;
  used_slots?: number;
  notes?: string;
  notes_template?: SponsorshipNotesTemplate;
};

export type SponsorshipStatusTransitionPayload = {
  status: Sponsorship["status"];
  reason?: string;
};

export type BudgetSummary = {
  month: number;
  year: number;
  total_slots: number;
  used_slots: number;
  utilization_percent: number;
};

export type SponsorshipBudgetRound = {
  id: number;
  year: number;
  round_number: number;
  start_date?: string | null;
  end_date?: string | null;
  slot_budget: number;
  allocated_slots: number;
  used_slots: number;
  utilization_percent: number;
  created_at: string;
  updated_at: string;
};

export type SponsorshipBudgetRoundPayload = {
  year: number;
  round_number: number;
  start_date?: string | null;
  end_date?: string | null;
  slot_budget: number;
};

export type SponsorshipBudgetRoundUpdatePayload = Partial<SponsorshipBudgetRoundPayload>;

export type SponsorshipMetrics = {
  active_cases: number;
  submitted_cases: number;
  suspended_cases: number;
  month_executed: number;
  budget_utilization_percent: number;
  current_budget?: BudgetSummary | null;
  alerts: string[];
};

export type SponsorshipListResponse = Page<Sponsorship>;

export type SponsorshipSponsorContext = {
  member_id: number;
  member_name: string;
  member_status?: string | null;
  marital_status?: string | null;
  spouse_name?: string | null;
  spouse_phone?: string | null;
  spouse_email?: string | null;
  last_sponsorship_id?: number | null;
  last_sponsorship_date?: string | null;
  last_sponsorship_status?: string | null;
  history_count_last_12_months: number;
  volunteer_services: string[];
  father_of_repentance_id?: number | null;
  father_of_repentance_name?: string | null;
  budget_usage?: BudgetSummary | null;
  payment_history_start?: string | null;
  payment_history_end?: string | null;
  payment_history?: ContributionPayment[];
};

export type VolunteerServiceType = "Holiday" | "GeneralService";

export type VolunteerGroup = {
  id: number;
  name: string;
  team_lead_first_name?: string | null;
  team_lead_last_name?: string | null;
  team_lead_phone?: string | null;
  team_lead_email?: string | null;
  volunteer_count: number;
  created_at: string;
  updated_at: string;
};

export type VolunteerGroupPayload = {
  name: string;
  team_lead_first_name?: string | null;
  team_lead_last_name?: string | null;
  team_lead_phone?: string | null;
  team_lead_email?: string | null;
};

export type VolunteerGroupUpdatePayload = Partial<VolunteerGroupPayload>;

export type VolunteerWorker = {
  id: number;
  group: { id: number; name: string };
  group_id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
  service_type: VolunteerServiceType;
  service_date: string;
  reason?: string | null;
  created_at: string;
  updated_at: string;
};

export type VolunteerWorkerPayload = {
  group_id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
  service_type: VolunteerServiceType;
  service_date: string;
  reason?: string | null;
};

export type VolunteerWorkerUpdatePayload = Partial<VolunteerWorkerPayload>;

export type VolunteerWorkerListResponse = Page<VolunteerWorker>;

export type SponsorshipTimelineEvent = {
  id: number;
  event_type: string;
  label: string;
  from_status?: string | null;
  to_status?: string | null;
  reason?: string | null;
  actor_id?: number | null;
  actor_name?: string | null;
  occurred_at: string;
};

export type SponsorshipTimelineResponse = {
  items: SponsorshipTimelineEvent[];
  total: number;
};

export type SponsorshipNote = {
  id: number;
  note?: string | null;
  restricted: boolean;
  created_at: string;
  created_by_id?: number | null;
  created_by_name?: string | null;
};

export type SponsorshipNotesListResponse = {
  items: SponsorshipNote[];
  total: number;
};

export type SponsorshipNotePayload = {
  note: string;
};

export type Lesson = {
  id: number;
  lesson_code: string;
  title: string;
  description?: string | null;
  level: "SundaySchool" | "Abenet";
  duration_minutes: number;
};

export type MezmurGroup = {
  id: number;
  code: string;
  title: string;
  language: "Geez" | "Amharic" | "English";
  category: "Liturgy" | "Youth" | "SpecialEvent";
  rehearsal_day: "Sunday" | "Monday" | "Tuesday" | "Wednesday" | "Thursday" | "Friday" | "Saturday";
  conductor_name?: string | null;
  capacity?: number | null;
};

export type AttendancePayload = {
  enrollment_id: number;
  lesson_date: string;
  status?: "Present" | "Absent" | "Excused";
  note?: string;
};

export type AbenetEnrollment = {
  id: number;
  parent: MemberSummary;
  child: { id: number | null; first_name: string; last_name: string };
  service_stage: "Alphabet" | "Reading" | "ForDeacons";
  status: "Active" | "Paused" | "Completed" | "Cancelled";
  monthly_amount: number;
  enrollment_date: string;
  last_payment_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type AbenetEnrollmentPayload = {
  parent_member_id: number;
  child_id?: number;
  child_first_name?: string;
  child_last_name?: string;
  birth_date: string;
  service_stage: AbenetEnrollment["service_stage"];
  enrollment_date: string;
  notes?: string;
};

export type AbenetEnrollmentUpdate = Partial<Omit<AbenetEnrollmentPayload, "parent_member_id" | "child_first_name" | "child_last_name" | "birth_date">> & {
  status?: AbenetEnrollment["status"];
};

export type AbenetPaymentPayload = {
  amount?: number;
  method: string;
  memo?: string;
};

export type AbenetReportRow = {
  child_name: string;
  parent_name: string;
  service_stage: AbenetEnrollment["service_stage"];
  last_payment_at?: string | null;
};

export type SchoolsMeta = {
  monthly_amount: number;
  service_stages: Array<AbenetEnrollment["service_stage"]>;
  statuses: Array<AbenetEnrollment["status"]>;
  payment_methods: string[];
};

export type AbenetEnrollmentList = Page<AbenetEnrollment>;

export type Newcomer = {
  id: number;
  newcomer_code: string;
  first_name: string;
  last_name: string;
  household_type: "Individual" | "Family";
  preferred_language?: string | null;
  interpreter_required: boolean;
  contact_phone?: string | null;
  contact_whatsapp?: string | null;
  contact_email?: string | null;
  family_size?: number | null;
  service_type?: string | null;
  arrival_date: string;
  country?: string | null;
  temporary_address?: string | null;
  temporary_address_street?: string | null;
  temporary_address_city?: string | null;
  temporary_address_province?: string | null;
  temporary_address_postal_code?: string | null;
  current_address_street?: string | null;
  current_address_city?: string | null;
  current_address_province?: string | null;
  current_address_postal_code?: string | null;
  county?: string | null;
  referred_by?: string | null;
  past_profession?: string | null;
  notes?: string | null;
  status: "New" | "Contacted" | "Assigned" | "InProgress" | "Settled" | "Closed";
  is_inactive: boolean;
  inactive_reason?: string | null;
  inactive_notes?: string | null;
  inactive_at?: string | null;
  inactive_by_id?: number | null;
  sponsored_by_member_id?: number | null;
  father_of_repentance_id?: number | null;
  assigned_owner_id?: number | null;
  followup_due_date?: string | null;
  converted_member_id?: number | null;
  assigned_owner_name?: string | null;
  sponsored_by_member_name?: string | null;
  last_interaction_at?: string | null;
  latest_sponsorship_id?: number | null;
  latest_sponsorship_status?: string | null;
  created_at: string;
  updated_at: string;
};

export type NewcomerListResponse = Page<Newcomer>;

export type NewcomerMetrics = {
  new_count: number;
  contacted_count: number;
  assigned_count: number;
  in_progress_count: number;
  settled_count: number;
  closed_count: number;
  inactive_count: number;
};

export type NewcomerInteraction = {
  id: number;
  newcomer_id: number;
  interaction_type: "Call" | "Visit" | "Meeting" | "Note" | "Other";
  visibility: "Restricted" | "Shared";
  note: string;
  occurred_at: string;
  created_at: string;
  created_by_id?: number | null;
};

export type NewcomerInteractionListResponse = {
  items: NewcomerInteraction[];
  total: number;
};

export type NewcomerInteractionPayload = {
  interaction_type?: NewcomerInteraction["interaction_type"];
  visibility?: NewcomerInteraction["visibility"];
  note: string;
  occurred_at?: string;
};

export type NewcomerAddressHistory = {
  id: number;
  newcomer_id: number;
  address_type: "Temporary" | "Current";
  street?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  changed_at: string;
  changed_by_id?: number | null;
};

export type NewcomerAddressHistoryListResponse = {
  items: NewcomerAddressHistory[];
  total: number;
};

export type NewcomerTimelineEvent = {
  id: number;
  event_type: string;
  label: string;
  detail?: string | null;
  actor_id?: number | null;
  actor_name?: string | null;
  occurred_at: string;
};

export type NewcomerTimelineResponse = {
  items: NewcomerTimelineEvent[];
  total: number;
};

export type NewcomerStatusTransitionPayload = {
  status: Newcomer["status"];
  reason?: string;
};

export type NewcomerInactivatePayload = {
  reason: string;
  notes: string;
};

export type NewcomerReactivatePayload = {
  reason?: string;
};

export type NewcomerFilters = {
  status?: string;
  assigned_owner_id?: number;
  sponsor_id?: number;
  county?: string;
  interpreter_required?: boolean;
  inactive?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
};

export type NewcomerPayload = {
  first_name: string;
  last_name: string;
  household_type?: Newcomer["household_type"];
  preferred_language?: string;
  interpreter_required?: boolean;
  arrival_date: string;
  contact_phone?: string;
  contact_whatsapp?: string;
  contact_email?: string;
  service_type?: string;
  family_size?: number;
  country?: string;
  temporary_address?: string;
  temporary_address_street?: string;
  temporary_address_city?: string;
  temporary_address_province?: string;
  temporary_address_postal_code?: string;
  current_address_street?: string;
  current_address_city?: string;
  current_address_province?: string;
  current_address_postal_code?: string;
  county?: string;
  referred_by?: string;
  past_profession?: string;
  notes?: string;
  status?: Newcomer["status"];
};

export type NewcomerUpdatePayload = Partial<Omit<NewcomerPayload, "arrival_date">> & {
  arrival_date?: string;
  status?: Newcomer["status"];
};

export type NewcomerConvertPayload = {
  member_id?: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  status?: string;
  district?: string;
  notes?: string;
  household_name?: string;
};

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

type ApiRequestInit = RequestInit & {
  skipSessionRestore?: boolean;
};

let accessToken: string | null =
  typeof window === "undefined" ? null : window.localStorage.getItem("access_token");

export function getToken(): string | null {
  return accessToken;
}

export function setToken(token: string | null): void {
  accessToken = token;
  if (typeof window === "undefined") {
    return;
  }
  if (token) {
    window.localStorage.setItem("access_token", token);
  } else {
    window.localStorage.removeItem("access_token");
  }
}

function shouldSetJsonContentType(body: BodyInit | null | undefined): boolean {
  if (!body) return false;
  if (typeof body === "string") return true;
  return false;
}

function buildHeaders(initHeaders?: HeadersInit, body?: BodyInit | null): Headers {
  const headers = new Headers(initHeaders ?? {});
  if (accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (shouldSetJsonContentType(body) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function authFetch(input: RequestInfo | URL, init: ApiRequestInit = {}, allowRetry = true) {
  const { skipSessionRestore, ...requestInit } = init;
  const headers = buildHeaders(requestInit.headers, requestInit.body ?? null);
  const res = await fetch(input, { ...requestInit, headers });

  if (res.status !== 401 || skipSessionRestore) {
    return res;
  }

  notifySessionExpired();
  setToken(null);

  if (!allowRetry) {
    return res;
  }

  await waitForSessionRestored();
  if (!accessToken || requestInit.signal?.aborted) {
    return res;
  }

  return authFetch(input, init, false);
}

function handleUnauthorized(message?: string): never {
  notifySessionExpired();
  setToken(null);
  throw new ApiError(401, message || "Unauthorized");
}

export class ApiError extends Error {
  status: number;
  body?: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = message;
  }
}

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const res = await authFetch(`${API_BASE}${path}`, init);

  const text = await res.text();

  if (res.status === 401) {
    handleUnauthorized(text || "Unauthorized");
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    const message = text || `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ApiError(res.status, "Unexpected response format");
  }
}

export async function exportMembers(params: Record<string, string | number | undefined | null>): Promise<Blob> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  const url = `${API_BASE}/members/export.csv${query ? `?${query}` : ""}`;
  const res = await authFetch(url, {
    headers: { Accept: "text/csv" },
  });

  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }

  if (res.status === 403) {
    const message = await res.text();
    throw new ApiError(403, message || "Forbidden");
  }

  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Export failed");
  }

  return res.blob();
}

export async function exportPaymentsReport(params: PaymentFilters = {}): Promise<Blob> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const url = `${API_BASE}/payments/export.csv${query ? `?${query}` : ""}`;
  const res = await authFetch(url, { headers: { Accept: "text/csv" } });

  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (res.status === 403) {
    const message = await res.text();
    throw new ApiError(403, message || "Forbidden");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Export failed");
  }
  return res.blob();
}

type SponsorshipExportParams = SponsorshipFilters & { ids?: string };

export async function exportSponsorshipsCsv(params: SponsorshipExportParams = {}): Promise<Blob> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const primaryUrl = `${API_BASE}/sponsorships/export.csv${query ? `?${query}` : ""}`;
  const fallbackUrl = `${API_BASE}/sponsorships/export${query ? `?${query}` : ""}`;
  let res = await authFetch(primaryUrl, { headers: { Accept: "text/csv" } });
  if (res.status === 404) {
    res = await authFetch(fallbackUrl, { headers: { Accept: "text/csv" } });
  }

  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (res.status === 403) {
    const message = await res.text();
    throw new ApiError(403, message || "Forbidden");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Export failed");
  }
  return res.blob();
}

export async function exportSponsorshipsExcel(params: SponsorshipExportParams = {}): Promise<Blob> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const primaryUrl = `${API_BASE}/sponsorships/export.xlsx${query ? `?${query}` : ""}`;
  const fallbackUrl = `${API_BASE}/sponsorships/export/excel${query ? `?${query}` : ""}`;
  let res = await authFetch(primaryUrl, {
    headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  });
  if (res.status === 404) {
    res = await authFetch(fallbackUrl, {
      headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    });
  }

  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (res.status === 403) {
    const message = await res.text();
    throw new ApiError(403, message || "Forbidden");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Export failed");
  }
  return res.blob();
}

export async function listSponsorships(params: SponsorshipFilters = {}): Promise<SponsorshipListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<SponsorshipListResponse>(`/sponsorships${query ? `?${query}` : ""}`);
}

export async function getSponsorship(id: number): Promise<Sponsorship> {
  return api<Sponsorship>(`/sponsorships/${id}`);
}

export async function getSponsorshipMetrics(filters: { start_date?: string; end_date?: string } = {}): Promise<SponsorshipMetrics> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return api<SponsorshipMetrics>(`/sponsorships/metrics${query ? `?${query}` : ""}`);
}

export async function getSponsorContext(memberId: number): Promise<SponsorshipSponsorContext> {
  return api<SponsorshipSponsorContext>(`/sponsorships/sponsors/${memberId}/context`);
}

export async function listVolunteerGroups(): Promise<VolunteerGroup[]> {
  return api<VolunteerGroup[]>("/volunteers/groups");
}

export async function createVolunteerGroup(payload: VolunteerGroupPayload): Promise<VolunteerGroup> {
  return api<VolunteerGroup>("/volunteers/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateVolunteerGroup(groupId: number, payload: VolunteerGroupUpdatePayload): Promise<VolunteerGroup> {
  return api<VolunteerGroup>(`/volunteers/groups/${groupId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function listVolunteerWorkers(params: {
  page?: number;
  page_size?: number;
  group_id?: number;
  service_type?: VolunteerServiceType;
  service_month?: number;
  service_year?: number;
  q?: string;
} = {}): Promise<VolunteerWorkerListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<VolunteerWorkerListResponse>(`/volunteers/workers${query ? `?${query}` : ""}`);
}

export async function createVolunteerWorker(payload: VolunteerWorkerPayload): Promise<VolunteerWorker> {
  return api<VolunteerWorker>("/volunteers/workers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateVolunteerWorker(workerId: number, payload: VolunteerWorkerUpdatePayload): Promise<VolunteerWorker> {
  return api<VolunteerWorker>(`/volunteers/workers/${workerId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteVolunteerWorker(workerId: number): Promise<void> {
  await api<void>(`/volunteers/workers/${workerId}`, {
    method: "DELETE",
  });
}

export async function listSponsorshipBudgetRounds(year?: number): Promise<SponsorshipBudgetRound[]> {
  const query = year ? `?year=${year}` : "";
  return api<SponsorshipBudgetRound[]>(`/sponsorships/budget-rounds${query}`);
}

export async function createSponsorshipBudgetRound(
  payload: SponsorshipBudgetRoundPayload,
): Promise<SponsorshipBudgetRound> {
  return api<SponsorshipBudgetRound>("/sponsorships/budget-rounds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSponsorshipBudgetRound(
  roundId: number,
  payload: SponsorshipBudgetRoundUpdatePayload,
): Promise<SponsorshipBudgetRound> {
  return api<SponsorshipBudgetRound>(`/sponsorships/budget-rounds/${roundId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSponsorshipBudgetRound(roundId: number): Promise<void> {
  await api<void>(`/sponsorships/budget-rounds/${roundId}`, {
    method: "DELETE",
  });
}

export async function createSponsorship(payload: SponsorshipPayload): Promise<Sponsorship> {
  return api<Sponsorship>("/sponsorships", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSponsorship(id: number, payload: Partial<SponsorshipPayload>): Promise<Sponsorship> {
  return api<Sponsorship>(`/sponsorships/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function transitionSponsorshipStatus(id: number, payload: SponsorshipStatusTransitionPayload): Promise<Sponsorship> {
  return api<Sponsorship>(`/sponsorships/${id}/status`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSponsorshipTimeline(id: number): Promise<SponsorshipTimelineResponse> {
  return api<SponsorshipTimelineResponse>(`/sponsorships/${id}/timeline`);
}

export async function listSponsorshipNotes(id: number): Promise<SponsorshipNotesListResponse> {
  return api<SponsorshipNotesListResponse>(`/sponsorships/${id}/notes`);
}

export async function createSponsorshipNote(id: number, payload: SponsorshipNotePayload): Promise<SponsorshipNote> {
  return api<SponsorshipNote>(`/sponsorships/${id}/notes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function remindSponsorship(id: number): Promise<Sponsorship> {
  return api<Sponsorship>(`/sponsorships/${id}/remind`, { method: "POST" });
}

let staffEndpointAvailable: boolean | null = null;

export async function listStaff(params: { search?: string; role?: string; limit?: number } = {}): Promise<StaffListResponse> {
  if (staffEndpointAvailable === false) {
    return { items: [], total: 0 };
  }
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  try {
    const response = await api<StaffListResponse>(`/staff${query ? `?${query}` : ""}`);
    staffEndpointAvailable = true;
    return response;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      staffEndpointAvailable = false;
      return { items: [], total: 0 };
    }
    throw error;
  }
}

export async function listNewcomers(params: NewcomerFilters = {}): Promise<NewcomerListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    const paramKey = key === "status" ? "status" : key;
    search.set(paramKey, String(value));
  });
  const query = search.toString();
  return api<NewcomerListResponse>(`/newcomers${query ? `?${query}` : ""}`);
}

export async function getNewcomerMetrics(): Promise<NewcomerMetrics> {
  return api<NewcomerMetrics>("/newcomers/metrics");
}

export async function getNewcomer(id: number): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}`);
}

export async function createNewcomer(payload: NewcomerPayload): Promise<Newcomer> {
  return api<Newcomer>("/newcomers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateNewcomer(id: number, payload: NewcomerUpdatePayload): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function transitionNewcomerStatus(id: number, payload: NewcomerStatusTransitionPayload): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}/status`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function inactivateNewcomer(id: number, payload: NewcomerInactivatePayload): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}/inactivate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reactivateNewcomer(id: number, payload: NewcomerReactivatePayload): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}/reactivate`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getNewcomerTimeline(id: number): Promise<NewcomerTimelineResponse> {
  return api<NewcomerTimelineResponse>(`/newcomers/${id}/timeline`);
}

export async function convertNewcomer(id: number, payload: NewcomerConvertPayload): Promise<Newcomer> {
  return api<Newcomer>(`/newcomers/${id}/convert`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listNewcomerInteractions(id: number): Promise<NewcomerInteractionListResponse> {
  return api<NewcomerInteractionListResponse>(`/newcomers/${id}/interactions`);
}

export async function createNewcomerInteraction(id: number, payload: NewcomerInteractionPayload): Promise<NewcomerInteraction> {
  return api<NewcomerInteraction>(`/newcomers/${id}/interactions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listNewcomerAddressHistory(id: number): Promise<NewcomerAddressHistoryListResponse> {
  return api<NewcomerAddressHistoryListResponse>(`/newcomers/${id}/address-history`);
}

export async function listLessons(level?: Lesson["level"]): Promise<Lesson[]> {
  const search = level ? `?level=${encodeURIComponent(level)}` : "";
  return api<Lesson[]>(`/schools/lessons${search}`);
}

export async function listMezmurGroups(): Promise<MezmurGroup[]> {
  return api<MezmurGroup[]>(`/schools/mezmur`);
}

export async function recordSundaySchoolAttendance(payload: AttendancePayload): Promise<SundaySchoolEnrollment> {
  return api<SundaySchoolEnrollment>(`/schools/sunday-school/attendance`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function promoteSundaySchool(payload: {
  enrollment_ids: number[];
  next_class_level: SundaySchoolEnrollment["class_level"];
  expected_graduation?: string;
}): Promise<{ updated: number; skipped: number }> {
  return api(`/schools/sunday-school/promotions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type AbenetFilters = {
  service_stage?: string;
  status?: string;
  q?: string;
  page?: number;
  page_size?: number;
};

export async function listAbenetEnrollments(params: AbenetFilters = {}): Promise<AbenetEnrollmentList> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<AbenetEnrollmentList>(`/schools/abenet${query ? `?${query}` : ""}`);
}

export async function createAbenetEnrollment(payload: AbenetEnrollmentPayload): Promise<AbenetEnrollment> {
  return api<AbenetEnrollment>(`/schools/abenet`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAbenetEnrollment(
  id: number,
  payload: AbenetEnrollmentUpdate,
): Promise<AbenetEnrollment> {
  return api<AbenetEnrollment>(`/schools/abenet/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function recordAbenetPayment(
  id: number,
  payload: AbenetPaymentPayload,
): Promise<AbenetEnrollment> {
  return api<AbenetEnrollment>(`/schools/abenet/${id}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSchoolsMeta(): Promise<SchoolsMeta> {
  return api<SchoolsMeta>(`/schools/meta`);
}

export async function getAbenetReport(): Promise<AbenetReportRow[]> {
  return api<AbenetReportRow[]>(`/schools/abenet/report`);
}

export type ImportReport = {
  inserted: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
};

export async function importMembers(file: File | Blob, filename = "members_import.csv"): Promise<ImportReport> {
  const payload =
    file instanceof File ? file : new File([file], filename, { type: "text/csv" });
  const body = new FormData();
  body.append("file", payload, payload.name);
  const res = await authFetch(`${API_BASE}/members/import`, {
    method: "POST",
    body,
  });

  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }

  const text = await res.text();

  if (res.status === 403) {
    throw new ApiError(403, text || "Forbidden");
  }

  if (!res.ok) {
    throw new ApiError(res.status, text || "Import failed");
  }

  if (!text) {
    throw new ApiError(res.status, "Import response missing body");
  }

  try {
    return JSON.parse(text) as ImportReport;
  } catch {
    throw new ApiError(res.status, "Import response invalid");
  }
}

export type AvatarUploadResponse = {
  avatar_url: string;
};

export type ContributionExceptionAttachmentUploadResponse = {
  attachment_url: string;
  attachment_name: string;
};

export async function uploadAvatar(memberId: number, file: File): Promise<AvatarUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await authFetch(`${API_BASE}/members/${memberId}/avatar`, {
    method: "POST",
    body,
  });
  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Avatar upload failed");
  }
  return res.json();
}

export async function deleteAvatar(memberId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/members/${memberId}/avatar`, {
    method: "DELETE",
  });
  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Avatar deletion failed");
  }
}

export async function uploadContributionExceptionAttachment(
  memberId: number,
  file: File,
): Promise<ContributionExceptionAttachmentUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const res = await authFetch(`${API_BASE}/members/${memberId}/contribution-exception-attachment`, {
    method: "POST",
    body,
  });
  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Attachment upload failed");
  }
  return res.json();
}

export async function deleteContributionExceptionAttachment(memberId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/members/${memberId}/contribution-exception-attachment`, {
    method: "DELETE",
  });
  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new Error(message || "Attachment deletion failed");
  }
}

export async function archiveMember(memberId: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/members/${memberId}/archive`, {
    method: "POST",
  });
  if (res.status === 401) {
    handleUnauthorized("Unauthorized");
  }
  if (!res.ok) {
    const message = await res.text();
    throw new ApiError(res.status, message || "Failed to archive member");
  }
}


export type MemberAuditEntry = {
  changed_at: string;
  actor: string;
  action: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

export async function getMemberAudit(memberId: number): Promise<MemberAuditEntry[]> {
  return api<MemberAuditEntry[]>(`/members/${memberId}/audit`);
}

export type ContributionPaymentPayload = {
  amount: number;
  paid_at?: string;
  method?: string;
  note?: string;
};

export async function getContributionPayments(memberId: number): Promise<ContributionPayment[]> {
  return api<ContributionPayment[]>(`/members/${memberId}/contributions`);
}

export async function createContributionPayment(
  memberId: number,
  payload: ContributionPaymentPayload,
): Promise<ContributionPayment> {
  return api<ContributionPayment>(`/members/${memberId}/contributions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type MembersMeta = {
  statuses: string[];
  genders: string[];
  marital_statuses: string[];
  payment_methods: string[];
  contribution_exception_reasons: string[];
  districts: string[];
  tags: Tag[];
  ministries: Ministry[];
  households: Household[];
  father_confessors: Priest[];
};

export type ChildPromotionCandidate = {
  child_id: number;
  child_name: string;
  birth_date?: string | null;
  turns_on: string;
  parent_member_id: number;
  parent_member_name: string;
  household?: Household | null;
};

export type ChildPromotionPreview = {
  items: ChildPromotionCandidate[];
  total: number;
};

export type ChildPromotionResultItem = {
  child_id: number;
  new_member_id: number;
  new_member_name: string;
  promoted_at: string;
};

export type ChildPromotionRunResponse = {
  promoted: ChildPromotionResultItem[];
};

export async function getMembersMeta(): Promise<MembersMeta> {
  return api<MembersMeta>("/members/meta");
}

export async function findMemberDuplicates(params: {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  exclude_member_id?: number;
}): Promise<MemberDuplicateMatch[]> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const response = await api<{ items: MemberDuplicateMatch[] }>(`/members/duplicates${query ? `?${query}` : ""}`);
  return response.items;
}

export async function updateMemberSpouse(
  memberId: number,
  payload: { marital_status?: string; spouse?: SpousePayload | null },
): Promise<Spouse | null> {
  return api<Spouse | null>(`/members/${memberId}/spouse`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function searchMembers(query: string, limit = 5): Promise<Page<Member>> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page_size", String(limit));
  params.set("sort", "-updated_at");
  return api<Page<Member>>(`/members?${params.toString()}`);
}

export async function searchMemberChildren(query: string, limit = 8): Promise<MemberChildSearchItem[]> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("limit", String(limit));
  const response = await api<{ items: MemberChildSearchItem[] }>(`/members/children-search?${params.toString()}`);
  return response.items;
}

export async function getPromotionPreview(withinDays?: number): Promise<ChildPromotionPreview> {
  const query = withinDays !== undefined ? `?within_days=${withinDays}` : "";
  return api<ChildPromotionPreview>(`/members/promotions${query}`);
}

export async function runChildPromotions(): Promise<ChildPromotionRunResponse> {
  return api<ChildPromotionRunResponse>("/members/promotions/run", { method: "POST" });
}

export async function searchPriests(search: string, limit = 20): Promise<Priest[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("limit", String(limit));
  return api<Priest[]>(`/priests?${params.toString()}`);
}

export type PriestPayload = {
  full_name: string;
  phone?: string;
  email?: string;
  status?: string;
};
export type PriestUpdatePayload = Partial<PriestPayload>;

export async function createPriest(payload: PriestPayload): Promise<Priest> {
  return api<Priest>("/priests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePriest(priestId: number, payload: PriestUpdatePayload): Promise<Priest> {
  return api<Priest>(`/priests/${priestId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function archivePriest(priestId: number): Promise<Priest> {
  return api<Priest>(`/priests/${priestId}/archive`, { method: "POST" });
}

export async function restorePriest(priestId: number): Promise<Priest> {
  return api<Priest>(`/priests/${priestId}/restore`, { method: "POST" });
}

export async function listHouseholds(params: { q?: string; page?: number; page_size?: number } = {}): Promise<HouseholdListResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", String(params.page));
  if (params.page_size) search.set("page_size", String(params.page_size));
  const query = search.toString();
  return api<HouseholdListResponse>(`/households${query ? `?${query}` : ""}`);
}

export async function getHousehold(householdId: number): Promise<HouseholdDetail> {
  return api<HouseholdDetail>(`/households/${householdId}`);
}

export async function createHousehold(payload: { name: string; head_member_id?: number | null }): Promise<Household> {
  return api<Household>("/households", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateHousehold(householdId: number, payload: { name?: string; head_member_id?: number | null }): Promise<Household> {
  return api<Household>(`/households/${householdId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteHousehold(householdId: number): Promise<void> {
  await api<void>(`/households/${householdId}`, { method: "DELETE" });
}

export async function assignHouseholdMembers(
  householdId: number,
  payload: { member_ids: number[]; head_member_id?: number | null },
): Promise<HouseholdDetail> {
  return api<HouseholdDetail>(`/households/${householdId}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getEligibleChildren(withinDays = 60): Promise<ChildPromotionPreview> {
  return api<ChildPromotionPreview>(`/children?eligible=true&since_days=${withinDays}`);
}

export async function promoteChild(childId: number): Promise<ChildPromotionResultItem> {
  return api<ChildPromotionResultItem>(`/children/${childId}/promote`, { method: "POST" });
}

export type PaymentFilters = {
  page?: number;
  page_size?: number;
  reference?: string | number;
  member_id?: number;
  service_type?: string;
  method?: string;
  status?: string;
  member_name?: string;
  start_date?: string;
  end_date?: string;
};

export async function listPayments(params: PaymentFilters = {}): Promise<PaymentListResponse> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  const response = await api<PaymentListResponse>(`/payments${query ? `?${query}` : ""}`);
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      amount: Number(item.amount),
    })),
  };
}

export type ListAdminUsersParams = {
  search?: string;
  role?: string;
  is_active?: boolean;
  linked?: boolean;
  limit?: number;
  offset?: number;
};

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUserListResponse> {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.role) search.set("role", params.role);
  if (typeof params.is_active === "boolean") search.set("is_active", String(params.is_active));
  if (typeof params.linked === "boolean") search.set("linked", String(params.linked));
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  if (typeof params.offset === "number") search.set("offset", String(params.offset));
  const query = search.toString();
  const path = query ? `/users?${query}` : "/users";
  return api<AdminUserListResponse>(path);
}

export async function getAdminUser(userId: number): Promise<AdminUserSummary> {
  return api<AdminUserSummary>(`/users/${userId}`);
}

export async function updateAdminUser(userId: number, payload: Partial<Pick<AdminUserSummary, "full_name" | "username" | "is_active" | "is_super_admin">>): Promise<AdminUserSummary> {
  return api<AdminUserSummary>(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateAdminUserRoles(userId: number, roles: string[]): Promise<AdminUserSummary> {
  return api<AdminUserSummary>(`/users/${userId}/roles`, {
    method: "POST",
    body: JSON.stringify({ roles }),
  });
}

export async function updateAdminUserMemberLink(userId: number, memberId: number | null, notes?: string): Promise<AdminUserSummary> {
  return api<AdminUserSummary>(`/users/${userId}/member-link`, {
    method: "POST",
    body: JSON.stringify({ member_id: memberId, notes }),
  });
}

export async function createUserInvitation(payload: InvitationCreatePayload): Promise<InvitationResponse> {
  const normalizedRoles = payload.roles ?? [];
  return api<InvitationResponse>("/users/invitations", {
    method: "POST",
    body: JSON.stringify({ ...payload, roles: normalizedRoles }),
  });
}

export async function resetAdminUserPassword(userId: number): Promise<InvitationResponse> {
  return api<InvitationResponse>(`/users/${userId}/reset-password`, { method: "POST" });
}

export async function searchAdminMembers(query: string, limit = 8): Promise<AdminUserMemberSummary[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return api<AdminUserMemberSummary[]>(`/users/member-search?${params.toString()}`);
}

export async function getAdminUserAudit(userId: number, limit = 50): Promise<AdminUserAuditEntry[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return api<AdminUserAuditEntry[]>(`/users/${userId}/audit?${params.toString()}`);
}

type PaymentCreatePayload = {
  amount: number;
  currency?: string;
  method?: string;
  memo?: string;
  service_type_code: string;
  member_id?: number | null;
  household_id?: number | null;
  posted_at?: string;
  due_date?: string;
  status?: string;
};

export async function createPaymentEntry(payload: PaymentCreatePayload): Promise<Payment> {
  const result = await api<Payment>("/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...result, amount: Number(result.amount) };
}

export async function correctPayment(paymentId: number, payload: { correction_reason: string }): Promise<Payment> {
  const result = await api<Payment>(`/payments/${paymentId}/correct`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { ...result, amount: Number(result.amount) };
}

export async function getPaymentSummary(filters: { start_date?: string; end_date?: string } = {}): Promise<PaymentSummaryResponse> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  const response = await api<PaymentSummaryResponse>(`/payments/reports/summary${query ? `?${query}` : ""}`);
  return {
    ...response,
    items: response.items.map((item) => ({
      ...item,
      total_amount: Number(item.total_amount),
    })),
    grand_total: Number(response.grand_total),
  };
}

export async function getReportActivity(filters: { start_date?: string; end_date?: string; limit?: number } = {}): Promise<ReportActivityItem[]> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<ReportActivityItem[]>(`/reports/activity${query ? `?${query}` : ""}`);
}

export async function getPaymentServiceTypes(includeInactive = false): Promise<PaymentServiceType[]> {
  const query = includeInactive ? "?include_inactive=true" : "";
  return api<PaymentServiceType[]>(`/payments/service-types${query}`);
}

export type LicenseStatusResponse = {
  state: "trial" | "active" | "expired" | "invalid";
  message: string;
  expires_at?: string | null;
  trial_expires_at: string;
  days_remaining: number;
  customer?: string | null;
};

export async function getLicenseStatus(): Promise<LicenseStatusResponse> {
  return api<LicenseStatusResponse>("/license/status");
}

export async function activateLicense(token: string): Promise<LicenseStatusResponse> {
  return api<LicenseStatusResponse>("/license/activate", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export type TokenResponse = { access_token: string; token_type: string };

export async function inviteAccept(
  token: string,
  payload: { full_name?: string; username?: string; password: string },
  signal?: AbortSignal
): Promise<TokenResponse> {
  return api<TokenResponse>(`/auth/invitations/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

export async function getAccountProfile(): Promise<AccountProfile> {
  return api<AccountProfile>("/account/me");
}

export async function updateAccountProfile(payload: { full_name?: string; username?: string }): Promise<AccountProfile> {
  return api<AccountProfile>("/account/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateAccountPassword(payload: { current_password: string; new_password: string }): Promise<void> {
  await api<void>("/account/me/password", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function requestAccountMemberLink(payload: { member_id: number | null; notes?: string }): Promise<AccountProfile> {
  return api<AccountProfile>("/account/me/member-link-request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function searchAccountMembers(query: string, limit = 8): Promise<AccountMemberSummary[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  return api<AccountMemberSummary[]>(`/account/me/member-search?${params.toString()}`);
}
export type SundaySchoolCategory = "Child" | "Youth" | "Adult";
export type SundaySchoolPaymentMethod = "CASH" | "DIRECT_DEPOSIT" | "E_TRANSFER" | "CREDIT";

export type SundaySchoolParticipant = {
  id: number;
  member_id: number;
  member_username: string;
  first_name: string;
  last_name: string;
  gender?: string | null;
  date_of_birth?: string | null;
  category: SundaySchoolCategory;
  membership_date?: string | null;
  phone?: string | null;
  email?: string | null;
  pays_contribution: boolean;
  monthly_amount?: number | null;
  payment_method?: SundaySchoolPaymentMethod | null;
  last_payment_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SundaySchoolParticipantList = {
  items: SundaySchoolParticipant[];
  total: number;
  page: number;
  page_size: number;
};

export type SundaySchoolParticipantPayload = {
  member_username: string;
  category: SundaySchoolCategory;
  first_name: string;
  last_name: string;
  gender: "Male" | "Female" | "Other";
  dob: string;
  membership_date: string;
  phone?: string | null;
  email?: string | null;
  pays_contribution?: boolean;
  monthly_amount?: number | null;
  payment_method?: SundaySchoolPaymentMethod;
};

export type SundaySchoolParticipantDetail = SundaySchoolParticipant & {
  recent_payments: {
    id: number;
    amount: number;
    method?: string | null;
    memo?: string | null;
    posted_at: string;
    status: string;
  }[];
};

export type SundaySchoolStats = {
  total_participants: number;
  count_child: number;
  count_youth: number;
  count_adult: number;
  count_paying_contribution: number;
  count_not_paying_contribution: number;
  revenue_last_30_days: number;
  pending_mezmur: number;
  pending_lessons: number;
  pending_art: number;
};

export type SundaySchoolContent = {
  id: number;
  type: "Mezmur" | "Lesson" | "Art";
  title: string;
  body?: string | null;
  file_path?: string | null;
  status: "Draft" | "Pending" | "Approved" | "Rejected";
  rejection_reason?: string | null;
  published: boolean;
  approved_at?: string | null;
  approved_by_id?: number | null;
  participant?: { id: number; first_name: string; last_name: string } | null;
  created_at: string;
  updated_at: string;
};

export type SundaySchoolContentPayload = {
  type: SundaySchoolContent["type"];
  title: string;
  body?: string;
  file_path?: string;
  participant_id?: number;
};

export type SundaySchoolContentList = {
  items: SundaySchoolContent[];
  total: number;
};

export type SundaySchoolMeta = {
  categories: SundaySchoolCategory[];
  payment_methods: SundaySchoolPaymentMethod[];
  content_types: SundaySchoolContent["type"][];
  content_statuses: SundaySchoolContent["status"][];
};

export async function getSundaySchoolMeta(): Promise<SundaySchoolMeta> {
  return api<SundaySchoolMeta>("/sunday-school/meta");
}

export async function listSundaySchoolParticipants(params: {
  category?: SundaySchoolCategory;
  pays_contribution?: boolean;
  membership_from?: string;
  membership_to?: string;
  last_payment_from?: string;
  last_payment_to?: string;
  search?: string;
  page?: number;
  page_size?: number;
} = {}): Promise<SundaySchoolParticipantList> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<SundaySchoolParticipantList>(`/sunday-school/participants${query ? `?${query}` : ""}`);
}

export async function createSundaySchoolParticipant(payload: SundaySchoolParticipantPayload): Promise<SundaySchoolParticipant> {
  return api<SundaySchoolParticipant>("/sunday-school/participants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSundaySchoolParticipant(
  participantId: number,
  payload: Partial<SundaySchoolParticipantPayload> & { is_active?: boolean },
): Promise<SundaySchoolParticipant> {
  return api<SundaySchoolParticipant>(`/sunday-school/participants/${participantId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deactivateSundaySchoolParticipant(participantId: number): Promise<SundaySchoolParticipant> {
  return api<SundaySchoolParticipant>(`/sunday-school/participants/${participantId}`, { method: "DELETE" });
}

export async function getSundaySchoolParticipant(participantId: number): Promise<SundaySchoolParticipantDetail> {
  return api<SundaySchoolParticipantDetail>(`/sunday-school/participants/${participantId}`);
}

export async function recordSundaySchoolContribution(
  participantId: number,
  payload: { amount?: number; method: SundaySchoolPaymentMethod; memo?: string },
): Promise<SundaySchoolParticipant> {
  return api<SundaySchoolParticipant>(`/sunday-school/participants/${participantId}/payments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getSundaySchoolStats(filters: { start_date?: string; end_date?: string } = {}): Promise<SundaySchoolStats> {
  const search = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return api<SundaySchoolStats>(`/sunday-school/participants/stats${query ? `?${query}` : ""}`);
}

export async function listSundaySchoolContent(params: {
  type?: SundaySchoolContent["type"];
  status?: SundaySchoolContent["status"];
  search?: string;
} = {}): Promise<SundaySchoolContentList> {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return api<SundaySchoolContentList>(`/sunday-school/content${query ? `?${query}` : ""}`);
}

export async function createSundaySchoolContent(payload: SundaySchoolContentPayload): Promise<SundaySchoolContent> {
  return api<SundaySchoolContent>("/sunday-school/content", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSundaySchoolContent(
  contentId: number,
  payload: Partial<SundaySchoolContentPayload> & { published?: boolean },
): Promise<SundaySchoolContent> {
  return api<SundaySchoolContent>(`/sunday-school/content/${contentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function submitSundaySchoolContent(contentId: number): Promise<SundaySchoolContent> {
  return api<SundaySchoolContent>(`/sunday-school/content/${contentId}/submit`, { method: "POST" });
}

export async function approveSundaySchoolContent(contentId: number, publishImmediately = true): Promise<SundaySchoolContent> {
  return api<SundaySchoolContent>(`/sunday-school/content/${contentId}/approve`, {
    method: "POST",
    body: JSON.stringify({ publish_immediately: publishImmediately }),
  });
}

export async function rejectSundaySchoolContent(contentId: number, reason: string): Promise<SundaySchoolContent> {
  return api<SundaySchoolContent>(`/sunday-school/content/${contentId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function listPublicSundaySchoolContent(type: SundaySchoolContent["type"]): Promise<SundaySchoolContent[]> {
  const path =
    type === "Mezmur" ? "/public/sunday-school/mezmur" : type === "Lesson" ? "/public/sunday-school/lessons" : "/public/sunday-school/art";
  return api<SundaySchoolContent[]>(path);
}
export type ChatMessageType = "text" | "image" | "file";

export type Message = {
  id: number;
  sender_id: number;
  recipient_id: number;
  content: string;
  timestamp: string;
  is_read: boolean;
  type?: ChatMessageType;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_mime?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
};

export type MessageCreatePayload = {
  recipient_id: number;
  content: string;
  type?: ChatMessageType;
};

export async function sendMessage(payload: MessageCreatePayload): Promise<Message> {
  return api<Message>("/chat/messages", {
    method: "POST",
    body: JSON.stringify({ ...payload, type: payload.type ?? "text" }),
  });
}

export async function uploadChatAttachment(recipientId: number, file: File): Promise<Message> {
  const form = new FormData();
  form.append("recipient_id", String(recipientId));
  form.append("file", file);

  return api<Message>("/chat/messages/upload", {
    method: "POST",
    body: form,
  });
}

export async function getMessages(otherUserId?: number): Promise<Message[]> {
  const query = otherUserId ? `?other_user_id=${otherUserId}` : "";
  return api<Message[]>(`/chat/messages${query}`);
}

export type ChatUser = {
  id: number;
  name: string;
  avatar_url: string;
  status: string;
};

export async function getChatUsers(): Promise<ChatUser[]> {
  return api<ChatUser[]>("/chat/users");
}

export async function markMessageRead(messageId: number): Promise<Message> {
  return api<Message>(`/chat/messages/${messageId}/read`, {
    method: "PUT",
  });
}

export async function deleteChatMessage(messageId: number): Promise<Message> {
  return api<Message>(`/chat/messages/${messageId}`, {
    method: "DELETE",
  });
}

// Email (Super Admin)
export type AdminEmailSummary = {
  uid: string;
  subject: string;
  sender: string;
  date?: string | null;
  snippet: string;
  has_html: boolean;
  has_attachments: boolean;
};

export type AdminEmailDetail = {
  uid: string;
  subject: string;
  sender: string;
  to: string[];
  cc: string[];
  date?: string | null;
  text_body: string;
  html_body?: string | null;
  headers: Record<string, string>;
  has_attachments: boolean;
};

export type SendAdminEmailPayload = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  reply_to?: string;
  audience?: "all_members" | "active_members" | "missing_phone" | "with_children" | "new_this_month";
  attachments?: { filename: string; content_base64: string; content_type: string }[];
};

export async function getAdminInbox(limit = 25, folder?: string): Promise<AdminEmailSummary[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (folder) params.set("folder", folder);
  const response = await api<{ items: AdminEmailSummary[] }>(`/emails?${params.toString()}`);
  return response.items;
}

export async function getAdminEmail(uid: string, folder?: string): Promise<AdminEmailDetail> {
  const params = new URLSearchParams();
  if (folder) params.set("folder", folder);
  const suffix = params.toString();
  return api<AdminEmailDetail>(`/emails/${encodeURIComponent(uid)}${suffix ? `?${suffix}` : ""}`);
}

export async function sendAdminEmail(payload: SendAdminEmailPayload): Promise<void> {
  const res = await api<{ status: string; refused?: string[] }>("/emails/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (res?.refused && res.refused.length) {
    throw new ApiError(207, JSON.stringify({ refused: res.refused }));
  }
}

export async function sendHeartbeat(): Promise<void> {
  await api("/chat/heartbeat", { method: "POST" });
}
