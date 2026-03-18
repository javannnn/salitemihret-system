from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


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
