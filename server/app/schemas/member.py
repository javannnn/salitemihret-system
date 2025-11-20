from datetime import date, datetime
import re
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, validator

from app.schemas.household import HouseholdOut
from app.schemas.payment import PaymentStatus

ALLOWED_MEMBER_STATUSES = {"Active", "Inactive", "Pending", "Archived"}
ALLOWED_MEMBER_GENDERS = {"Male", "Female"}
ALLOWED_MEMBER_MARITAL_STATUSES = {"Single", "Married", "Divorced", "Widowed", "Separated", "Other"}
ALLOWED_CONTRIBUTION_METHODS = {"Cash", "Debit", "Credit", "E-Transfer", "Cheque", "Direct Deposit"}
ALLOWED_CONTRIBUTION_EXCEPTION_REASONS = {"LowIncome", "Senior", "Student", "Other"}

CANADIAN_PHONE_ERROR = "Phone number must be a valid Canadian number (e.g., +16475550123)"


def normalize_member_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if not digits:
        raise ValueError("Phone number is required")
    if digits.startswith("1") and len(digits) == 11:
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError(CANADIAN_PHONE_ERROR)
    return f"+1{digits}"


def normalize_optional_member_phone(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return normalize_member_phone(stripped)


class SpouseBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    gender: Optional[str] = None
    country_of_birth: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=25)
    email: Optional[EmailStr] = None

    @validator("gender")
    def validate_gender(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_GENDERS:
            raise ValueError("Invalid gender value")
        return value

    @validator("phone")
    def validate_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_optional_member_phone(value)


class SpouseCreate(SpouseBase):
    pass


class SpouseOut(SpouseBase):
    id: int
    full_name: str

    class Config:
        from_attributes = True


class ChildBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=120)
    last_name: str = Field(..., min_length=1, max_length=120)
    gender: Optional[str] = None
    country_of_birth: Optional[str] = Field(None, max_length=120)
    birth_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=255)

    @validator("gender")
    def validate_gender(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_GENDERS:
            raise ValueError("Invalid gender value")
        return value


class ChildCreate(ChildBase):
    pass


class ChildOut(ChildBase):
    id: int
    full_name: str

    class Config:
        from_attributes = True


class TagOut(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class MinistryOut(BaseModel):
    id: int
    name: str
    slug: str

    class Config:
        from_attributes = True


class MemberAuditOut(BaseModel):
    id: int
    field: str
    old_value: Optional[str]
    new_value: Optional[str]
    changed_by_id: Optional[int]
    changed_at: datetime

    class Config:
        from_attributes = True


class PriestOut(BaseModel):
    id: int
    full_name: str
    phone: Optional[str]
    email: Optional[EmailStr]
    status: str

    class Config:
        from_attributes = True


class PriestCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    status: Optional[str] = Field("Active", max_length=50)


class PriestUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    status: Optional[str] = Field(None, max_length=50)


class MemberBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    baptismal_name: Optional[str] = Field(None, max_length=150)
    email: Optional[EmailStr] = None
    phone: str = Field(..., min_length=3, max_length=25)
    birth_date: Optional[date] = None
    join_date: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=255)
    address_city: Optional[str] = Field(None, max_length=120)
    address_region: Optional[str] = Field(None, max_length=120)
    address_postal_code: Optional[str] = Field(None, max_length=30)
    address_country: Optional[str] = Field(None, max_length=120)
    district: Optional[str] = Field(None, max_length=100)
    status: str = Field(default="Active")
    is_tither: bool = False
    pays_contribution: bool = False
    contribution_method: Optional[str] = Field(None, max_length=100)
    contribution_amount: Optional[float] = None
    contribution_exception_reason: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)
    household_id: Optional[int] = None
    household_name: Optional[str] = Field(None, max_length=150)
    household_size_override: Optional[int] = Field(None, ge=1, le=25)
    has_father_confessor: bool = False
    father_confessor_id: Optional[int] = None
    status_override: Optional[bool] = None
    status_override_value: Optional[str] = None
    status_override_reason: Optional[str] = Field(None, max_length=255)
    spouse: Optional[SpouseCreate] = None
    children: List[ChildCreate] = Field(default_factory=list)
    tag_ids: List[int] = Field(default_factory=list)
    ministry_ids: List[int] = Field(default_factory=list)

    @validator("birth_date", "join_date")
    def validate_dates(cls, value: Optional[date]) -> Optional[date]:
        if value and value > date.today():
            raise ValueError("Dates cannot be in the future")
        return value

    @validator("status")
    def validate_status(cls, value: str) -> str:
        if value not in ALLOWED_MEMBER_STATUSES:
            raise ValueError("Invalid status value")
        return value

    @validator("gender")
    def validate_gender(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_GENDERS:
            raise ValueError("Invalid gender value")
        return value

    @validator("phone")
    def validate_phone(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("Phone number is required")
        return normalize_member_phone(value.strip())

    @validator("marital_status")
    def validate_marital_status(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_MARITAL_STATUSES:
            raise ValueError("Invalid marital status value")
        return value

    @validator("contribution_method")
    def validate_contribution_method(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_CONTRIBUTION_METHODS:
            raise ValueError("Invalid contribution method value")
        return value

    @validator("contribution_exception_reason")
    def validate_contribution_exception_reason(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_CONTRIBUTION_EXCEPTION_REASONS:
            raise ValueError("Invalid contribution exception reason")
        return value

    @validator("contribution_exception_reason")
    def validate_contribution_exception_reason(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_CONTRIBUTION_EXCEPTION_REASONS:
            raise ValueError("Invalid contribution exception reason")
        return value

    @validator("status_override_value")
    def validate_override_value(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_STATUSES:
            raise ValueError("Invalid override status value")
        return value


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    baptismal_name: Optional[str] = Field(None, max_length=150)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=25)
    birth_date: Optional[date] = None
    join_date: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    address: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=255)
    address_city: Optional[str] = Field(None, max_length=120)
    address_region: Optional[str] = Field(None, max_length=120)
    address_postal_code: Optional[str] = Field(None, max_length=30)
    address_country: Optional[str] = Field(None, max_length=120)
    district: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = None
    is_tither: Optional[bool] = None
    pays_contribution: Optional[bool] = None
    contribution_method: Optional[str] = Field(None, max_length=100)
    contribution_amount: Optional[float] = None
    contribution_exception_reason: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)
    household_id: Optional[int] = None
    household_name: Optional[str] = Field(None, max_length=150)
    household_size_override: Optional[int] = Field(None, ge=1, le=25)
    has_father_confessor: Optional[bool] = None
    father_confessor_id: Optional[int] = None
    spouse: Optional[SpouseCreate] = None
    children: Optional[List[ChildCreate]] = None
    tag_ids: Optional[List[int]] = None
    ministry_ids: Optional[List[int]] = None
    status_override: Optional[bool] = None
    status_override_value: Optional[str] = None
    status_override_reason: Optional[str] = Field(None, max_length=255)

    @validator("birth_date", "join_date")
    def validate_dates(cls, value: Optional[date]) -> Optional[date]:
        if value and value > date.today():
            raise ValueError("Dates cannot be in the future")
        return value

    @validator("status")
    def validate_status(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ALLOWED_MEMBER_STATUSES:
            raise ValueError("Invalid status value")
        return value

    @validator("gender")
    def validate_gender(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_GENDERS:
            raise ValueError("Invalid gender value")
        return value

    @validator("marital_status")
    def validate_marital_status(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_MARITAL_STATUSES:
            raise ValueError("Invalid marital status value")
        return value

    @validator("contribution_method")
    def validate_contribution_method(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_CONTRIBUTION_METHODS:
            raise ValueError("Invalid contribution method value")
        return value

    @validator("status_override_value")
    def validate_override_value(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_STATUSES:
            raise ValueError("Invalid override status value")
        return value


class MemberSpouseUpdate(BaseModel):
    marital_status: Optional[str] = None
    spouse: Optional[SpouseCreate] = None

    @validator("marital_status")
    def validate_marital_status(cls, value: Optional[str]) -> Optional[str]:
        if value and value not in ALLOWED_MEMBER_MARITAL_STATUSES:
            raise ValueError("Invalid marital status value")
        return value


class MemberListOut(BaseModel):
    id: int
    username: str
    first_name: str
    middle_name: Optional[str]
    last_name: str
    status: str
    gender: Optional[str]
    birth_date: Optional[date]
    marital_status: Optional[str]
    district: Optional[str]
    email: Optional[EmailStr]
    phone: Optional[str]
    avatar_path: Optional[str]
    is_tither: bool
    pays_contribution: bool
    contribution_method: Optional[str]
    contribution_amount: Optional[float]
    contribution_currency: str
    contribution_exception_reason: Optional[str]
    family_count: int
    has_father_confessor: bool

    class Config:
        from_attributes = True


class ContributionPaymentOut(BaseModel):
    id: int
    amount: float
    currency: str
    paid_at: date
    method: Optional[str]
    note: Optional[str]
    recorded_by_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class MemberSundaySchoolParticipantOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    member_username: str
    category: str
    pays_contribution: bool
    monthly_amount: Optional[float]
    payment_method: Optional[str]
    last_payment_at: Optional[datetime]
    status: Literal["Up to date", "Overdue", "No payments yet", "Not contributing"]

    class Config:
        from_attributes = True


class MemberSundaySchoolPaymentOut(BaseModel):
    id: int
    amount: float
    currency: str
    method: Optional[str]
    memo: Optional[str]
    posted_at: datetime
    status: PaymentStatus
    service_type_label: str

    class Config:
        from_attributes = True


class MembershipEventOut(BaseModel):
    timestamp: datetime
    type: Literal["Renewal", "Overdue", "Override"]
    label: str
    description: Optional[str] = None


class MembershipHealthOut(BaseModel):
    effective_status: str
    auto_status: str
    override_active: bool
    override_reason: Optional[str]
    last_paid_at: Optional[datetime]
    next_due_at: Optional[datetime]
    days_until_due: Optional[int]
    overdue_days: Optional[int]


class MemberDetailOut(MemberListOut):
    birth_date: Optional[date]
    join_date: Optional[date]
    baptismal_name: Optional[str]
    address: Optional[str]
    address_street: Optional[str]
    address_city: Optional[str]
    address_region: Optional[str]
    address_postal_code: Optional[str]
    address_country: Optional[str]
    is_tither: bool
    pays_contribution: bool
    contribution_method: Optional[str]
    contribution_amount: Optional[float]
    contribution_currency: str
    contribution_exception_reason: Optional[str]
    notes: Optional[str]
    household_size_override: Optional[int]
    father_confessor: Optional[PriestOut]
    spouse: Optional[SpouseOut]
    children: List[ChildOut] = Field(default_factory=list)
    household: Optional[HouseholdOut]
    tags: List[TagOut] = Field(default_factory=list)
    ministries: List[MinistryOut] = Field(default_factory=list)
    contribution_history: List[ContributionPaymentOut] = Field(default_factory=list)
    sunday_school_participants: List[MemberSundaySchoolParticipantOut] = Field(default_factory=list)
    sunday_school_payments: List[MemberSundaySchoolPaymentOut] = Field(default_factory=list)
    status_override: bool
    status_override_value: Optional[str]
    status_override_reason: Optional[str]
    membership_health: MembershipHealthOut
    membership_events: List[MembershipEventOut] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[int]
    updated_by_id: Optional[int]

    class Config:
        from_attributes = True


class MemberListResponse(BaseModel):
    items: List[MemberListOut]
    total: int
    page: int
    page_size: int

    class Config:
        from_attributes = True


class AvatarUploadResponse(BaseModel):
    avatar_url: str


class ContributionPaymentCreate(BaseModel):
    amount: float = Field(..., gt=0)
    paid_at: Optional[date] = None
    method: Optional[str] = Field(None, max_length=100)
    note: Optional[str] = Field(None, max_length=255)

    @validator("amount")
    def validate_amount(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Amount must be greater than zero")
        return round(value, 2)

    @validator("paid_at", pre=True, always=True)
    def default_paid_at(cls, value: Optional[date]) -> date:
        return value or date.today()


class ImportErrorItem(BaseModel):
    row: int
    reason: str


class ImportReportResponse(BaseModel):
    inserted: int
    updated: int
    failed: int
    errors: List[ImportErrorItem]


class MemberAuditFeedItem(BaseModel):
    changed_at: datetime
    actor: str
    action: str
    field: str
    old_value: Optional[str]
    new_value: Optional[str]


class MemberDuplicateMatch(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[EmailStr]
    phone: Optional[str]
    reason: str

    class Config:
        from_attributes = True


class MemberDuplicateResponse(BaseModel):
    items: List[MemberDuplicateMatch]


class MemberMetaResponse(BaseModel):
    statuses: List[str]
    genders: List[str]
    marital_statuses: List[str]
    payment_methods: List[str]
    districts: List[str]
    tags: List[TagOut]
    ministries: List[MinistryOut]
    households: List[HouseholdOut]
    father_confessors: List[PriestOut]
    contribution_exception_reasons: List[str]


class ChildPromotionCandidate(BaseModel):
    child_id: int
    child_name: str
    birth_date: Optional[date]
    turns_on: date
    parent_member_id: int
    parent_member_name: str
    household: Optional[HouseholdOut]


class ChildPromotionPreviewResponse(BaseModel):
    items: List[ChildPromotionCandidate]
    total: int


class ChildPromotionResultItem(BaseModel):
    child_id: int
    new_member_id: int
    new_member_name: str
    promoted_at: datetime


class ChildPromotionRunResponse(BaseModel):
    promoted: List[ChildPromotionResultItem]
