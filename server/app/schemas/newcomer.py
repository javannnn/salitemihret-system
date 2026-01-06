from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator, validator

NewcomerStatus = Literal["New", "Contacted", "Assigned", "InProgress", "Settled", "Closed"]
NewcomerHouseholdType = Literal["Individual", "Family"]
NewcomerInteractionType = Literal["Call", "Visit", "Meeting", "Note", "Other"]
NewcomerInteractionVisibility = Literal["Restricted", "Shared"]
NewcomerAddressType = Literal["Temporary", "Current"]


class NewcomerBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    household_type: NewcomerHouseholdType = "Individual"
    preferred_language: Optional[str] = Field(None, max_length=60)
    interpreter_required: bool = False
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_whatsapp: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[EmailStr] = None
    family_size: Optional[int] = Field(None, ge=1, le=20)
    service_type: Optional[str] = Field(None, max_length=120)
    arrival_date: date
    country: Optional[str] = Field(None, max_length=120)
    temporary_address: Optional[str] = Field(None, max_length=255)
    temporary_address_street: Optional[str] = Field(None, max_length=255)
    temporary_address_city: Optional[str] = Field(None, max_length=120)
    temporary_address_province: Optional[str] = Field(None, max_length=120)
    temporary_address_postal_code: Optional[str] = Field(None, max_length=20)
    current_address_street: Optional[str] = Field(None, max_length=255)
    current_address_city: Optional[str] = Field(None, max_length=120)
    current_address_province: Optional[str] = Field(None, max_length=120)
    current_address_postal_code: Optional[str] = Field(None, max_length=20)
    county: Optional[str] = Field(None, max_length=120)
    referred_by: Optional[str] = Field(None, max_length=120)
    past_profession: Optional[str] = None
    notes: Optional[str] = None
    status: NewcomerStatus = "New"
    is_inactive: bool = False
    inactive_reason: Optional[str] = None
    inactive_at: Optional[datetime] = None
    inactive_by_id: Optional[int] = None
    sponsored_by_member_id: Optional[int] = None
    father_of_repentance_id: Optional[int] = None
    assigned_owner_id: Optional[int] = None
    followup_due_date: Optional[date] = None

    @model_validator(mode="after")
    def ensure_contact(self: "NewcomerBase") -> "NewcomerBase":
        if not self.contact_phone and not self.contact_email and not self.contact_whatsapp:
            raise ValueError("Provide at least a phone number, WhatsApp, or email for newcomer intake")
        return self

    @validator("arrival_date")
    def validate_arrival(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("Arrival date cannot be in the future")
        return value


class NewcomerCreate(NewcomerBase):
    pass


class NewcomerUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=120)
    last_name: Optional[str] = Field(None, min_length=1, max_length=120)
    household_type: Optional[NewcomerHouseholdType] = None
    preferred_language: Optional[str] = Field(None, max_length=60)
    interpreter_required: Optional[bool] = None
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_whatsapp: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[EmailStr] = None
    family_size: Optional[int] = Field(None, ge=1, le=20)
    service_type: Optional[str] = Field(None, max_length=120)
    arrival_date: Optional[date] = None
    country: Optional[str] = Field(None, max_length=120)
    temporary_address: Optional[str] = Field(None, max_length=255)
    temporary_address_street: Optional[str] = Field(None, max_length=255)
    temporary_address_city: Optional[str] = Field(None, max_length=120)
    temporary_address_province: Optional[str] = Field(None, max_length=120)
    temporary_address_postal_code: Optional[str] = Field(None, max_length=20)
    current_address_street: Optional[str] = Field(None, max_length=255)
    current_address_city: Optional[str] = Field(None, max_length=120)
    current_address_province: Optional[str] = Field(None, max_length=120)
    current_address_postal_code: Optional[str] = Field(None, max_length=20)
    county: Optional[str] = Field(None, max_length=120)
    referred_by: Optional[str] = Field(None, max_length=120)
    past_profession: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[NewcomerStatus] = None
    is_inactive: Optional[bool] = None
    inactive_reason: Optional[str] = None
    inactive_at: Optional[datetime] = None
    inactive_by_id: Optional[int] = None
    sponsored_by_member_id: Optional[int] = None
    father_of_repentance_id: Optional[int] = None
    assigned_owner_id: Optional[int] = None
    followup_due_date: Optional[date] = None


class NewcomerOut(BaseModel):
    id: int
    newcomer_code: str
    first_name: str
    last_name: str
    household_type: NewcomerHouseholdType
    preferred_language: Optional[str]
    interpreter_required: bool
    contact_phone: Optional[str]
    contact_whatsapp: Optional[str]
    contact_email: Optional[str]
    family_size: Optional[int]
    service_type: Optional[str]
    arrival_date: date
    country: Optional[str]
    temporary_address: Optional[str]
    temporary_address_street: Optional[str]
    temporary_address_city: Optional[str]
    temporary_address_province: Optional[str]
    temporary_address_postal_code: Optional[str]
    current_address_street: Optional[str]
    current_address_city: Optional[str]
    current_address_province: Optional[str]
    current_address_postal_code: Optional[str]
    county: Optional[str]
    referred_by: Optional[str]
    past_profession: Optional[str]
    notes: Optional[str]
    status: NewcomerStatus
    is_inactive: bool
    inactive_reason: Optional[str]
    inactive_notes: Optional[str]
    inactive_at: Optional[datetime]
    inactive_by_id: Optional[int]
    sponsored_by_member_id: Optional[int]
    father_of_repentance_id: Optional[int]
    assigned_owner_id: Optional[int]
    followup_due_date: Optional[date]
    converted_member_id: Optional[int]
    assigned_owner_name: Optional[str]
    sponsored_by_member_name: Optional[str]
    last_interaction_at: Optional[datetime]
    latest_sponsorship_id: Optional[int]
    latest_sponsorship_status: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NewcomerListResponse(BaseModel):
    items: list[NewcomerOut]
    total: int
    page: int
    page_size: int


class NewcomerMetrics(BaseModel):
    new_count: int
    contacted_count: int
    assigned_count: int
    in_progress_count: int
    settled_count: int
    closed_count: int
    inactive_count: int


class NewcomerConvertRequest(BaseModel):
    member_id: Optional[int] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=120)
    last_name: Optional[str] = Field(None, min_length=1, max_length=120)
    phone: Optional[str] = Field(None, min_length=3, max_length=25)
    email: Optional[EmailStr] = None
    status: Optional[str] = Field(None, max_length=20)
    district: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = None
    household_name: Optional[str] = Field(None, max_length=150)

    @model_validator(mode="after")
    def ensure_conversion_inputs(self: "NewcomerConvertRequest") -> "NewcomerConvertRequest":
        if not self.member_id and not self.phone and not self.email:
            raise ValueError("Provide a phone or email for the new member when not linking to an existing member")
        return self


class NewcomerStatusTransitionRequest(BaseModel):
    status: NewcomerStatus
    reason: Optional[str] = Field(None, max_length=500)


class NewcomerInactivateRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)
    notes: str = Field(..., min_length=3, max_length=1000)


class NewcomerReactivateRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


class NewcomerInteractionCreate(BaseModel):
    interaction_type: NewcomerInteractionType = "Note"
    visibility: NewcomerInteractionVisibility = "Restricted"
    note: str = Field(..., min_length=1)
    occurred_at: Optional[datetime] = None


class NewcomerInteractionOut(BaseModel):
    id: int
    newcomer_id: int
    interaction_type: NewcomerInteractionType
    visibility: NewcomerInteractionVisibility
    note: str
    occurred_at: datetime
    created_at: datetime
    created_by_id: Optional[int]

    class Config:
        from_attributes = True


class NewcomerInteractionListResponse(BaseModel):
    items: list[NewcomerInteractionOut]
    total: int


class NewcomerAddressHistoryOut(BaseModel):
    id: int
    newcomer_id: int
    address_type: NewcomerAddressType
    street: Optional[str]
    city: Optional[str]
    province: Optional[str]
    postal_code: Optional[str]
    changed_at: datetime
    changed_by_id: Optional[int]

    class Config:
        from_attributes = True


class NewcomerTimelineEvent(BaseModel):
    id: int
    event_type: str
    label: str
    detail: Optional[str]
    actor_id: Optional[int]
    actor_name: Optional[str]
    occurred_at: datetime


class NewcomerTimelineResponse(BaseModel):
    items: list[NewcomerTimelineEvent]
    total: int


class NewcomerAddressHistoryListResponse(BaseModel):
    items: list[NewcomerAddressHistoryOut]
    total: int
