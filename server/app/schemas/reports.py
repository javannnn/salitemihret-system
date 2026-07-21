from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.household import HouseholdDetail
from app.schemas.member import (
    ChildOut,
    ContributionPaymentOut,
    MemberDetailOut,
    MemberSundaySchoolParticipantOut,
    MemberSundaySchoolPaymentOut,
    MembershipEventOut,
    MembershipHealthOut,
    MinistryOut,
    SpouseOut,
    TagOut,
)
from app.schemas.payment import PaymentOut


class ReportActivityItem(BaseModel):
    id: str
    category: Literal["promotion", "member", "sponsorship", "newcomer", "user"]
    action: str
    actor: str | None
    target: str | None
    detail: str | None
    occurred_at: datetime
    entity_type: str | None = None
    entity_id: int | None = None


class ReportBreakdownItem(BaseModel):
    label: str
    value: int
    share_percent: float | None = None


class NewcomerReportSummary(BaseModel):
    total_cases: int
    open_cases: int
    inactive_cases: int
    settled_cases: int
    closed_cases: int
    unassigned_cases: int
    sponsored_cases: int
    interpreter_required_cases: int
    family_households: int
    recent_intakes_30_days: int
    followups_overdue: int
    followups_due_next_7_days: int
    stale_cases: int
    interactions_last_30_days: int
    submitted_support_cases: int
    active_support_cases: int
    suspended_support_cases: int


class NewcomerOwnerBreakdownItem(BaseModel):
    owner_id: int | None = None
    owner_name: str
    total_cases: int
    overdue_followups: int
    stale_cases: int


class NewcomerReportCaseItem(BaseModel):
    id: int
    newcomer_code: str
    full_name: str
    status: str
    arrival_date: date
    created_at: datetime
    followup_due_date: date | None = None
    assigned_owner_name: str | None = None
    sponsored_by_member_name: str | None = None
    last_interaction_at: datetime | None = None
    county: str | None = None
    preferred_language: str | None = None
    interpreter_required: bool
    household_type: str
    family_size: int | None = None
    service_type: str | None = None
    attention_reason: str | None = None


class NewcomerReportResponse(BaseModel):
    summary: NewcomerReportSummary
    status_breakdown: list[ReportBreakdownItem]
    followup_breakdown: list[ReportBreakdownItem]
    county_breakdown: list[ReportBreakdownItem]
    language_breakdown: list[ReportBreakdownItem]
    referral_breakdown: list[ReportBreakdownItem]
    interaction_breakdown: list[ReportBreakdownItem]
    sponsorship_breakdown: list[ReportBreakdownItem]
    owner_breakdown: list[NewcomerOwnerBreakdownItem]
    recent_cases: list[NewcomerReportCaseItem]
    attention_cases: list[NewcomerReportCaseItem]


class ParishCouncilReportRow(BaseModel):
    department: str
    lead_first_name: str | None = None
    lead_last_name: str | None = None
    lead_email: str | None = None
    lead_phone: str | None = None
    trainee_first_name: str
    trainee_last_name: str
    trainee_email: str | None = None
    trainee_phone: str | None = None
    training_from: date
    training_to: date
    status: str


class ParishCouncilReportSummary(BaseModel):
    total_rows: int
    active_assignments: int
    expiring_30_days: int
    departments_covered: int
    missing_contact_rows: int


class ParishCouncilReportResponse(BaseModel):
    summary: ParishCouncilReportSummary
    status_breakdown: list[ReportBreakdownItem]
    department_breakdown: list[ReportBreakdownItem]
    expiring_assignments: list[ParishCouncilReportRow]
    rows: list[ParishCouncilReportRow]


class IndividualSponsorshipReportItem(BaseModel):
    id: int
    role: Literal["Sponsor", "Beneficiary"]
    beneficiary_name: str
    status: str
    program: str | None = None
    frequency: str
    monthly_amount: Decimal | None = None
    received_amount: Decimal | None = None
    paid_amount: Decimal | None = None
    currency: str | None = None
    start_date: date
    end_date: date | None = None
    notes: str | None = None


class ClientMembershipChildField(BaseModel):
    child_name: str
    birth_year: int | None = None


class ClientMembershipReportFields(BaseModel):
    first_name: str
    last_name: str
    membership_date: date | None = None
    spouse_name: str | None = None
    children: list[ClientMembershipChildField]


class ClientPaymentReportRow(BaseModel):
    first_name: str
    last_name: str
    amount: float
    currency: str
    payment_date: datetime
    email: str | None = None


class ClientPaymentYearSummary(BaseModel):
    year: int
    total_amount: float
    currency: str
    payment_count: int


class ClientSponsorshipVolunteerRow(BaseModel):
    volunteer_date: date | None = None
    service_type: str


class ClientSponsorshipReportFields(BaseModel):
    first_name: str
    last_name: str
    membership_date: date | None = None
    payment_information_by_year: list[ClientPaymentYearSummary]
    volunteer_rows: list[ClientSponsorshipVolunteerRow]
    last_sponsored_date: date | None = None
    number_sponsored: int
    last_sponsor_status: str | None = None


class ClientReportFields(BaseModel):
    membership: ClientMembershipReportFields
    payments: list[ClientPaymentReportRow]
    payment_years: list[ClientPaymentYearSummary]
    sponsorship: ClientSponsorshipReportFields


class IndividualMemberReportResponse(BaseModel):
    generated_at: datetime
    financial_access: bool
    member: MemberDetailOut
    household: HouseholdDetail | None = None
    children: list[ChildOut]
    spouse: SpouseOut | None = None
    tags: list[TagOut]
    ministries: list[MinistryOut]
    sunday_school_participants: list[MemberSundaySchoolParticipantOut]
    sunday_school_payments: list[MemberSundaySchoolPaymentOut]
    contribution_history: list[ContributionPaymentOut]
    payments: list[PaymentOut]
    sponsorships: list[IndividualSponsorshipReportItem]
    membership_health: MembershipHealthOut
    membership_events: list[MembershipEventOut]
    client_report_fields: ClientReportFields
