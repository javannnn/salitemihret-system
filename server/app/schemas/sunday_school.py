from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field

SundayCategory = Literal["Child", "Youth", "Adult"]
SundayPaymentMethod = Literal["CASH", "DIRECT_DEPOSIT", "E_TRANSFER", "CREDIT"]
SundayContentType = Literal["Mezmur", "Lesson", "Art"]
SundayContentStatus = Literal["Draft", "Pending", "Approved", "Rejected"]
MemberGenderLiteral = Literal["Male", "Female", "Other"]


class ParticipantBase(BaseModel):
    member_username: str = Field(..., min_length=3, max_length=150)
    category: SundayCategory
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    gender: MemberGenderLiteral
    dob: date
    membership_date: date
    phone: Optional[str] = Field(None, max_length=40)
    email: Optional[EmailStr] = None
    pays_contribution: bool = False
    monthly_amount: Optional[float] = Field(None, gt=0)
    payment_method: Optional[SundayPaymentMethod] = None

class ParticipantCreate(ParticipantBase):
    pass


class ParticipantUpdate(BaseModel):
    member_username: Optional[str] = Field(None, min_length=3, max_length=150)
    category: Optional[SundayCategory] = None
    first_name: Optional[str] = Field(None, min_length=1, max_length=120)
    last_name: Optional[str] = Field(None, min_length=1, max_length=120)
    gender: Optional[MemberGenderLiteral] = None
    dob: Optional[date] = None
    membership_date: Optional[date] = None
    phone: Optional[str] = Field(None, max_length=40)
    email: Optional[EmailStr] = None
    pays_contribution: Optional[bool] = None
    monthly_amount: Optional[float] = Field(None, gt=0)
    payment_method: Optional[SundayPaymentMethod] = None
    is_active: Optional[bool] = None


class ParticipantOut(BaseModel):
    id: int
    member_id: int
    member_username: str
    first_name: str
    last_name: str
    gender: Optional[MemberGenderLiteral]
    dob: Optional[date] = Field(None, alias="date_of_birth")
    category: SundayCategory
    membership_date: Optional[date]
    phone: Optional[str]
    email: Optional[str]
    pays_contribution: bool
    monthly_amount: Optional[float]
    payment_method: Optional[SundayPaymentMethod]
    last_payment_at: Optional[datetime]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
        allow_population_by_field_name = True


class ParticipantList(BaseModel):
    items: list[ParticipantOut]
    total: int
    page: int
    page_size: int


class PaymentSummary(BaseModel):
    id: int
    amount: float
    method: Optional[str]
    memo: Optional[str]
    posted_at: datetime
    status: str


class ParticipantDetail(ParticipantOut):
    recent_payments: list[PaymentSummary]

    class Config:
        from_attributes = True
        allow_population_by_field_name = True


class ContributionCreate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    method: SundayPaymentMethod
    memo: Optional[str] = Field(None, max_length=255)


class SundaySchoolStats(BaseModel):
    total_participants: int
    count_child: int
    count_youth: int
    count_adult: int
    count_paying_contribution: int
    count_not_paying_contribution: int
    revenue_last_30_days: float
    pending_mezmur: int
    pending_lessons: int
    pending_art: int


class ContentBase(BaseModel):
    type: SundayContentType
    title: str = Field(..., min_length=1, max_length=200)
    body: Optional[str] = None
    file_path: Optional[str] = Field(None, max_length=500)
    participant_id: Optional[int] = None
    published: bool = False


class ContentCreate(ContentBase):
    pass


class ContentUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = None
    file_path: Optional[str] = Field(None, max_length=500)
    participant_id: Optional[int] = None
    published: Optional[bool] = None


class ContentParticipantRef(BaseModel):
    id: int
    first_name: str
    last_name: str

    class Config:
        from_attributes = True


class ContentOut(BaseModel):
    id: int
    type: SundayContentType
    title: str
    body: Optional[str]
    file_path: Optional[str]
    status: SundayContentStatus
    rejection_reason: Optional[str]
    published: bool
    approved_at: Optional[datetime]
    approved_by_id: Optional[int]
    participant: Optional[ContentParticipantRef]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ContentList(BaseModel):
    items: list[ContentOut]
    total: int


class ContentApprovalRequest(BaseModel):
    publish_immediately: bool = True


class ContentRejectionRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)


class PublicContentOut(BaseModel):
    id: int
    title: str
    type: SundayContentType
    body: Optional[str]
    file_path: Optional[str]
    participant_name: Optional[str]
    published_at: datetime


class SundaySchoolReportRow(BaseModel):
    first_name: str
    last_name: str
    category: SundayCategory
    last_payment_at: Optional[datetime]


class SundaySchoolMeta(BaseModel):
    categories: list[SundayCategory]
    payment_methods: list[SundayPaymentMethod]
    content_types: list[SundayContentType]
    content_statuses: list[SundayContentStatus]
