from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, validator

LessonLevel = Literal["SundaySchool", "Abenet"]
MezmurLanguage = Literal["Geez", "Amharic", "English"]
MezmurCategory = Literal["Liturgy", "Youth", "SpecialEvent"]
WeekdayName = Literal["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
AbenetServiceStage = Literal["Alphabet", "Reading", "ForDeacons"]
AbenetEnrollmentStatus = Literal["Active", "Paused", "Completed", "Cancelled"]


class MemberMini(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class ChildSummary(BaseModel):
    id: Optional[int]
    first_name: str
    last_name: str


class LessonOut(BaseModel):
    id: int
    lesson_code: str
    title: str
    description: Optional[str]
    level: LessonLevel
    duration_minutes: int

    class Config:
        from_attributes = True


class MezmurOut(BaseModel):
    id: int
    code: str
    title: str
    language: MezmurLanguage
    category: MezmurCategory
    rehearsal_day: WeekdayName
    conductor_name: Optional[str]
    capacity: Optional[int]

    class Config:
        from_attributes = True


class AbenetEnrollmentCreate(BaseModel):
    parent_member_id: int
    child_id: Optional[int] = None
    child_first_name: Optional[str] = Field(None, max_length=120)
    child_last_name: Optional[str] = Field(None, max_length=120)
    birth_date: date
    service_stage: AbenetServiceStage
    enrollment_date: date
    notes: Optional[str] = None

    @validator("child_first_name", always=True)
    def ensure_child_first(cls, value: Optional[str], values: dict) -> Optional[str]:
        if not values.get("child_id") and not (value and value.strip()):
            raise ValueError("Child first name is required when child_id is not provided")
        return value

    @validator("child_last_name", always=True)
    def ensure_child_last(cls, value: Optional[str], values: dict) -> Optional[str]:
        if not values.get("child_id") and not (value and value.strip()):
            raise ValueError("Child last name is required when child_id is not provided")
        return value


class AbenetEnrollmentUpdate(BaseModel):
    service_stage: Optional[AbenetServiceStage] = None
    status: Optional[AbenetEnrollmentStatus] = None
    enrollment_date: Optional[date] = None
    notes: Optional[str] = None


class AbenetEnrollmentOut(BaseModel):
    id: int
    parent: MemberMini
    child: ChildSummary
    service_stage: AbenetServiceStage
    status: AbenetEnrollmentStatus
    monthly_amount: float
    enrollment_date: date
    last_payment_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AbenetEnrollmentList(BaseModel):
    items: list[AbenetEnrollmentOut]
    total: int
    page: int
    page_size: int


class AbenetPaymentCreate(BaseModel):
    amount: Optional[float] = None
    method: Optional[str] = Field(None, max_length=100)
    memo: Optional[str] = Field(None, max_length=255)


class AbenetReportRow(BaseModel):
    child_name: str
    parent_name: str
    service_stage: AbenetServiceStage
    last_payment_at: Optional[datetime]


class SchoolsMeta(BaseModel):
    monthly_amount: float
    service_stages: list[AbenetServiceStage]
    statuses: list[AbenetEnrollmentStatus]
    payment_methods: list[str]
