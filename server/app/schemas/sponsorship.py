from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, validator

from app.schemas.member import ContributionPaymentOut

SponsorshipStatus = Literal["Draft", "Submitted", "Approved", "Rejected", "Active", "Suspended", "Completed", "Closed"]
SponsorshipDecision = Literal["Approved", "Rejected", "Pending"]
SponsorshipProgram = Literal[
    "Education",
    "Nutrition",
    "Healthcare",
    "Housing",
    "EmergencyRelief",
    "SpecialProjects",
    "Youth Scholarship",
]
SponsorshipPledgeChannel = Literal["InPerson", "OnlinePortal", "Phone", "EventBooth"]
SponsorshipReminderChannel = Literal["Email", "SMS", "Phone", "WhatsApp"]
SponsorshipMotivation = Literal["HonorMemorial", "CommunityOutreach", "Corporate", "ParishInitiative", "Other"]
SponsorshipNotesTemplate = Literal["FollowUp", "PaymentIssue", "Gratitude", "Escalation"]


class MemberSummary(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class NewcomerSummary(BaseModel):
    id: int
    first_name: str
    last_name: str
    status: str

    class Config:
        from_attributes = True


class SponsorshipBase(BaseModel):
    sponsor_member_id: int
    beneficiary_member_id: Optional[int] = None
    newcomer_id: Optional[int] = None
    beneficiary_name: Optional[str] = Field(None, max_length=255)
    father_of_repentance_id: Optional[int] = None
    volunteer_services: Optional[list[str]] = Field(default=None)
    volunteer_service_other: Optional[str] = Field(None, max_length=255)
    payment_information: Optional[str] = Field(None, max_length=255)
    last_sponsored_date: Optional[date] = None
    frequency: str = Field(default="Monthly", max_length=50)
    last_status: Optional[SponsorshipDecision] = None
    last_status_reason: Optional[str] = Field(None, max_length=255)
    start_date: date
    end_date: Optional[date] = None
    status: SponsorshipStatus = "Draft"
    monthly_amount: Decimal = Field(..., gt=0)
    received_amount: Optional[Decimal] = Field(None, ge=0)
    program: Optional[SponsorshipProgram] = None
    pledge_channel: Optional[SponsorshipPledgeChannel] = None
    reminder_channel: Optional[SponsorshipReminderChannel] = "Email"
    motivation: Optional[SponsorshipMotivation] = None
    budget_month: Optional[int] = Field(None, ge=1, le=12)
    budget_year: Optional[int] = Field(None, ge=2000, le=2100)
    budget_round_id: Optional[int] = None
    budget_slots: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None
    assigned_staff_id: Optional[int] = None
    notes_template: Optional[SponsorshipNotesTemplate] = None

    @validator("end_date")
    def validate_dates(cls, value: Optional[date], values: dict) -> Optional[date]:
        start = values.get("start_date")
        if value and start and value < start:
            raise ValueError("End date cannot be before start date")
        return value

    @validator("last_status_reason")
    def validate_last_status_reason(cls, value: Optional[str], values: dict) -> Optional[str]:
        decision = values.get("last_status")
        if decision == "Rejected" and not (value and value.strip()):
            raise ValueError("Provide a reason when marking the last status as Rejected")
        return value


class SponsorshipCreate(SponsorshipBase):
    pass


class SponsorshipUpdate(BaseModel):
    beneficiary_member_id: Optional[int] = None
    newcomer_id: Optional[int] = None
    beneficiary_name: Optional[str] = Field(None, max_length=255)
    father_of_repentance_id: Optional[int] = None
    volunteer_services: Optional[list[str]] = None
    volunteer_service_other: Optional[str] = Field(None, max_length=255)
    payment_information: Optional[str] = Field(None, max_length=255)
    last_sponsored_date: Optional[date] = None
    frequency: Optional[str] = Field(None, max_length=50)
    last_status: Optional[SponsorshipDecision] = None
    last_status_reason: Optional[str] = Field(None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[SponsorshipStatus] = None
    monthly_amount: Optional[Decimal] = Field(None, gt=0)
    received_amount: Optional[Decimal] = Field(None, ge=0)
    program: Optional[SponsorshipProgram] = None
    pledge_channel: Optional[SponsorshipPledgeChannel] = None
    reminder_channel: Optional[SponsorshipReminderChannel] = None
    motivation: Optional[SponsorshipMotivation] = None
    budget_month: Optional[int] = Field(None, ge=1, le=12)
    budget_year: Optional[int] = Field(None, ge=2000, le=2100)
    budget_round_id: Optional[int] = None
    budget_slots: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None
    assigned_staff_id: Optional[int] = None
    used_slots: Optional[int] = Field(None, ge=0)
    notes_template: Optional[SponsorshipNotesTemplate] = None
    rejection_reason: Optional[str] = None

    @validator("end_date")
    def validate_dates(cls, value: Optional[date], values: dict) -> Optional[date]:
        start = values.get("start_date")
        if value and start and isinstance(start, date) and value < start:
            raise ValueError("End date cannot be before start date")
        return value

    @validator("last_status_reason")
    def validate_reason(cls, value: Optional[str], values: dict) -> Optional[str]:
        decision = values.get("last_status")
        if decision == "Rejected" and not (value and value.strip()):
            raise ValueError("Provide a reason when marking the last status as Rejected")
        return value


class SponsorshipOut(BaseModel):
    id: int
    sponsor: MemberSummary
    beneficiary_member: Optional[MemberSummary] = None
    newcomer: Optional[NewcomerSummary] = None
    beneficiary_name: str
    father_of_repentance_id: Optional[int]
    volunteer_services: list[str]
    volunteer_service_other: Optional[str]
    payment_information: Optional[str]
    last_sponsored_date: Optional[date]
    days_since_last_sponsorship: Optional[int]
    frequency: str
    status: SponsorshipStatus
    monthly_amount: Decimal
    received_amount: Decimal
    program: Optional[SponsorshipProgram]
    pledge_channel: Optional[SponsorshipPledgeChannel]
    reminder_channel: Optional[SponsorshipReminderChannel]
    motivation: Optional[SponsorshipMotivation]
    start_date: date
    end_date: Optional[date]
    last_status: Optional[SponsorshipDecision]
    last_status_reason: Optional[str]
    budget_month: Optional[int]
    budget_year: Optional[int]
    budget_round_id: Optional[int]
    budget_slots: Optional[int]
    budget_round: Optional[SponsorshipBudgetRoundSummary] = None
    used_slots: int
    budget_utilization_percent: Optional[float]
    budget_over_capacity: bool
    notes: Optional[str]
    notes_template: Optional[SponsorshipNotesTemplate]
    reminder_last_sent: Optional[datetime]
    reminder_next_due: Optional[datetime]
    assigned_staff_id: Optional[int]
    submitted_at: Optional[datetime]
    submitted_by_id: Optional[int]
    approved_at: Optional[datetime]
    approved_by_id: Optional[int]
    rejected_at: Optional[datetime]
    rejected_by_id: Optional[int]
    rejection_reason: Optional[str]
    sponsor_status: Optional[str]
    father_of_repentance_name: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SponsorshipListResponse(BaseModel):
    items: list[SponsorshipOut]
    total: int
    page: int
    page_size: int


class BudgetSummary(BaseModel):
    month: int
    year: int
    total_slots: int
    used_slots: int
    utilization_percent: float


class SponsorshipBudgetRoundSummary(BaseModel):
    id: int
    year: int
    round_number: int
    start_date: Optional[date]
    end_date: Optional[date]
    slot_budget: int

    class Config:
        from_attributes = True


SponsorshipOut.update_forward_refs()


class SponsorshipBudgetRoundBase(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    round_number: int = Field(..., ge=1, le=12)
    start_date: Optional[date]
    end_date: Optional[date]
    slot_budget: int = Field(..., ge=1)

    @validator("end_date")
    def validate_end_date(cls, value: Optional[date], values: dict) -> Optional[date]:
        start_date = values.get("start_date")
        if value and start_date and value < start_date:
            raise ValueError("End date must be on or after the start date")
        return value


class SponsorshipBudgetRoundCreate(SponsorshipBudgetRoundBase):
    pass


class SponsorshipBudgetRoundUpdate(BaseModel):
    year: Optional[int] = Field(None, ge=2000, le=2100)
    round_number: Optional[int] = Field(None, ge=1, le=12)
    start_date: Optional[date]
    end_date: Optional[date]
    slot_budget: Optional[int] = Field(None, ge=1)

    @validator("end_date")
    def validate_end_date(cls, value: Optional[date], values: dict) -> Optional[date]:
        start_date = values.get("start_date")
        if value and start_date and value < start_date:
            raise ValueError("End date must be on or after the start date")
        return value


class SponsorshipBudgetRoundOut(SponsorshipBudgetRoundBase):
    id: int
    allocated_slots: int
    used_slots: int
    utilization_percent: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SponsorshipMetrics(BaseModel):
    active_cases: int
    submitted_cases: int
    suspended_cases: int
    month_executed: int
    budget_utilization_percent: float
    current_budget: Optional[BudgetSummary]
    alerts: list[str]


class SponsorshipSponsorContext(BaseModel):
    member_id: int
    member_name: str
    member_status: Optional[str]
    last_sponsorship_id: Optional[int]
    last_sponsorship_date: Optional[date]
    last_sponsorship_status: Optional[str]
    history_count_last_12_months: int
    volunteer_services: list[str]
    father_of_repentance_id: Optional[int]
    father_of_repentance_name: Optional[str]
    budget_usage: Optional[BudgetSummary]
    payment_history_start: Optional[date]
    payment_history_end: Optional[date]
    payment_history: list[ContributionPaymentOut] = Field(default_factory=list)


class SponsorshipTimelineEvent(BaseModel):
    id: int
    event_type: str
    label: str
    from_status: Optional[str]
    to_status: Optional[str]
    reason: Optional[str]
    actor_id: Optional[int]
    actor_name: Optional[str]
    occurred_at: datetime


class SponsorshipTimelineResponse(BaseModel):
    items: list[SponsorshipTimelineEvent]
    total: int


class SponsorshipNoteCreate(BaseModel):
    note: str = Field(..., min_length=1)


class SponsorshipNoteOut(BaseModel):
    id: int
    note: Optional[str]
    restricted: bool
    created_at: datetime
    created_by_id: Optional[int]
    created_by_name: Optional[str]


class SponsorshipNotesListResponse(BaseModel):
    items: list[SponsorshipNoteOut]
    total: int


class SponsorshipStatusTransitionRequest(BaseModel):
    status: SponsorshipStatus
    reason: Optional[str] = Field(None, max_length=500)
