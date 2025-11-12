from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator, validator

NewcomerStatus = Literal["New", "InProgress", "Sponsored", "Converted", "Closed"]


class NewcomerBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    preferred_language: Optional[str] = Field(None, max_length=60)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[EmailStr] = None
    family_size: Optional[int] = Field(None, ge=1, le=20)
    service_type: Optional[str] = Field(None, max_length=120)
    arrival_date: date
    country: Optional[str] = Field(None, max_length=120)
    temporary_address: Optional[str] = Field(None, max_length=255)
    referred_by: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = None
    status: NewcomerStatus = "New"
    sponsored_by_member_id: Optional[int] = None
    father_of_repentance_id: Optional[int] = None
    assigned_owner_id: Optional[int] = None
    followup_due_date: Optional[date] = None

    @model_validator(mode="after")
    def ensure_contact(self: "NewcomerBase") -> "NewcomerBase":
        if not self.contact_phone and not self.contact_email:
            raise ValueError("Provide at least a phone number or email for newcomer intake")
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
    preferred_language: Optional[str] = Field(None, max_length=60)
    contact_phone: Optional[str] = Field(None, max_length=50)
    contact_email: Optional[EmailStr] = None
    family_size: Optional[int] = Field(None, ge=1, le=20)
    service_type: Optional[str] = Field(None, max_length=120)
    arrival_date: Optional[date] = None
    country: Optional[str] = Field(None, max_length=120)
    temporary_address: Optional[str] = Field(None, max_length=255)
    referred_by: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = None
    status: Optional[NewcomerStatus] = None
    sponsored_by_member_id: Optional[int] = None
    father_of_repentance_id: Optional[int] = None
    assigned_owner_id: Optional[int] = None
    followup_due_date: Optional[date] = None


class NewcomerOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    preferred_language: Optional[str]
    contact_phone: Optional[str]
    contact_email: Optional[str]
    family_size: Optional[int]
    service_type: Optional[str]
    arrival_date: date
    country: Optional[str]
    temporary_address: Optional[str]
    referred_by: Optional[str]
    notes: Optional[str]
    status: NewcomerStatus
    sponsored_by_member_id: Optional[int]
    father_of_repentance_id: Optional[int]
    assigned_owner_id: Optional[int]
    followup_due_date: Optional[date]
    converted_member_id: Optional[int]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class NewcomerListResponse(BaseModel):
    items: list[NewcomerOut]
    total: int
    page: int
    page_size: int


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
