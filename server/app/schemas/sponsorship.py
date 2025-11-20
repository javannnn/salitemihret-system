from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, validator

SponsorshipStatus = Literal["Draft", "Active", "Suspended", "Completed", "Closed"]
SponsorshipFrequency = Literal["OneTime", "Monthly", "Quarterly", "Yearly"]
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
    frequency: SponsorshipFrequency = "Monthly"
    last_status: Optional[SponsorshipDecision] = None
    last_status_reason: Optional[str] = Field(None, max_length=255)
    start_date: date
    end_date: Optional[date] = None
    status: SponsorshipStatus = "Draft"
    monthly_amount: Decimal = Field(..., gt=0)
    program: Optional[SponsorshipProgram] = None
    pledge_channel: Optional[SponsorshipPledgeChannel] = None
    reminder_channel: Optional[SponsorshipReminderChannel] = "Email"
    motivation: Optional[SponsorshipMotivation] = None
    budget_month: Optional[int] = Field(None, ge=1, le=12)
    budget_year: Optional[int] = Field(None, ge=2000, le=2100)
    budget_amount: Optional[Decimal] = Field(None, gt=0)
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
    frequency: Optional[SponsorshipFrequency] = None
    last_status: Optional[SponsorshipDecision] = None
    last_status_reason: Optional[str] = Field(None, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[SponsorshipStatus] = None
    monthly_amount: Optional[Decimal] = Field(None, gt=0)
    program: Optional[SponsorshipProgram] = None
    pledge_channel: Optional[SponsorshipPledgeChannel] = None
    reminder_channel: Optional[SponsorshipReminderChannel] = None
    motivation: Optional[SponsorshipMotivation] = None
    budget_month: Optional[int] = Field(None, ge=1, le=12)
    budget_year: Optional[int] = Field(None, ge=2000, le=2100)
    budget_amount: Optional[Decimal] = Field(None, gt=0)
    budget_slots: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None
    assigned_staff_id: Optional[int] = None
    used_slots: Optional[int] = Field(None, ge=0)
    notes_template: Optional[SponsorshipNotesTemplate] = None

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


class PaymentHealth(BaseModel):
    monthly_contribution: Optional[Decimal]
    method: Optional[str]
    last_payment_date: Optional[date]
    status: Literal["Green", "Yellow", "Red"]
    days_since_last_payment: Optional[int]


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
    frequency: SponsorshipFrequency
    status: SponsorshipStatus
    monthly_amount: Decimal
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
    budget_amount: Optional[Decimal]
    budget_slots: Optional[int]
    used_slots: int
    budget_utilization_percent: Optional[float]
    budget_over_capacity: bool
    notes: Optional[str]
    notes_template: Optional[SponsorshipNotesTemplate]
    reminder_last_sent: Optional[datetime]
    reminder_next_due: Optional[datetime]
    assigned_staff_id: Optional[int]
    amount_paid: Decimal
    pledged_total: Decimal
    outstanding_balance: Decimal
    sponsor_status: Optional[str]
    father_of_repentance_name: Optional[str]
    payment_health: Optional["PaymentHealth"]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SponsorshipListResponse(BaseModel):
    items: list[SponsorshipOut]
    total: int
    page: int
    page_size: int


SponsorshipOut.update_forward_refs()


class BudgetSummary(BaseModel):
    month: int
    year: int
    total_slots: int
    used_slots: int
    utilization_percent: float


class SponsorshipMetrics(BaseModel):
    total_active_sponsors: int
    newcomers_sponsored: int
    month_sponsorships: int
    budget_utilization_percent: float
    current_budget: Optional[BudgetSummary]
    alerts: list[str]
