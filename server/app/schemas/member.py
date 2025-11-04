from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, validator

ALLOWED_MEMBER_STATUSES = {"Active", "Inactive", "Pending", "Archived"}
ALLOWED_MEMBER_GENDERS = {"Male", "Female", "Other"}
ALLOWED_MEMBER_MARITAL_STATUSES = {"Single", "Married", "Divorced", "Widowed", "Separated", "Other"}
ALLOWED_CONTRIBUTION_METHODS = {"Cash", "Direct Deposit", "E-Transfer", "Credit"}
ALLOWED_CONTRIBUTION_EXCEPTION_REASONS = {"LowIncome", "Senior", "Student", "Other"}


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


class HouseholdOut(BaseModel):
    id: int
    name: str
    head_member_id: Optional[int]

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
        return value.strip()

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


class MemberListOut(BaseModel):
    id: int
    username: str
    first_name: str
    middle_name: Optional[str]
    last_name: str
    status: str
    gender: Optional[str]
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
    children: List[ChildOut]
    household: Optional[HouseholdOut]
    tags: List[TagOut]
    ministries: List[MinistryOut]
    contribution_history: List[ContributionPaymentOut]
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
