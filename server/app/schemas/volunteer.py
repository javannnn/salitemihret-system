from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, validator

from app.schemas.member import normalize_optional_member_phone

VolunteerServiceType = Literal["Holiday", "GeneralService"]


class VolunteerGroupBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    team_lead_first_name: Optional[str] = Field(None, max_length=100)
    team_lead_last_name: Optional[str] = Field(None, max_length=100)
    team_lead_phone: Optional[str] = Field(None, max_length=40)
    team_lead_email: Optional[EmailStr] = None

    @validator("name")
    def clean_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned


class VolunteerGroupCreate(VolunteerGroupBase):
    pass


class VolunteerGroupUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=150)
    team_lead_first_name: Optional[str] = Field(None, max_length=100)
    team_lead_last_name: Optional[str] = Field(None, max_length=100)
    team_lead_phone: Optional[str] = Field(None, max_length=40)
    team_lead_email: Optional[EmailStr] = None


class VolunteerGroupOut(VolunteerGroupBase):
    id: int
    volunteer_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VolunteerGroupSummary(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class VolunteerWorkerBase(BaseModel):
    group_id: int
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=40)
    service_type: VolunteerServiceType
    service_date: date
    reason: Optional[str] = Field(None, max_length=500)

    @validator("first_name", "last_name")
    def clean_names(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned

    @validator("phone")
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)


class VolunteerWorkerCreate(VolunteerWorkerBase):
    pass


class VolunteerWorkerUpdate(BaseModel):
    group_id: Optional[int]
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    phone: Optional[str] = Field(None, max_length=40)
    service_type: Optional[VolunteerServiceType]
    service_date: Optional[date]
    reason: Optional[str] = Field(None, max_length=500)

    @validator("first_name", "last_name")
    def clean_names(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name is required")
        return cleaned

    @validator("phone")
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)


class VolunteerWorkerOut(VolunteerWorkerBase):
    id: int
    group: VolunteerGroupSummary
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VolunteerWorkerListResponse(BaseModel):
    items: list[VolunteerWorkerOut]
    total: int
    page: int
    page_size: int
