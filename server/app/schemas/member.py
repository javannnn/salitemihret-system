from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, validator

ALLOWED_MEMBER_STATUSES = {"Active", "Inactive", "Archived"}
ALLOWED_MEMBER_GENDERS = {"Male", "Female", "Other"}


class SpouseBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=25)
    email: Optional[EmailStr] = None


class SpouseCreate(SpouseBase):
    pass


class SpouseOut(SpouseBase):
    id: int

    class Config:
        from_attributes = True


class ChildBase(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)
    birth_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=255)


class ChildCreate(ChildBase):
    pass


class ChildOut(ChildBase):
    id: int

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


class MemberBase(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=25)
    birth_date: Optional[date] = None
    join_date: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = Field(None, max_length=255)
    district: Optional[str] = Field(None, max_length=100)
    status: str = Field(default="Active")
    is_tither: bool = False
    contribution_method: Optional[str] = Field(None, max_length=100)
    contribution_amount: Optional[float] = None
    notes: Optional[str] = Field(None, max_length=500)
    household_id: Optional[int] = None
    spouse: Optional[SpouseCreate] = None
    children: List[ChildCreate] = Field(default_factory=list)

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


class MemberCreate(MemberBase):
    tag_ids: List[int] = Field(default_factory=list)
    ministry_ids: List[int] = Field(default_factory=list)


class MemberUpdate(BaseModel):
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    middle_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=25)
    birth_date: Optional[date] = None
    join_date: Optional[date] = None
    gender: Optional[str] = None
    address: Optional[str] = Field(None, max_length=255)
    district: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = None
    is_tither: Optional[bool] = None
    contribution_method: Optional[str] = Field(None, max_length=100)
    contribution_amount: Optional[float] = None
    notes: Optional[str] = Field(None, max_length=500)
    household_id: Optional[int] = None
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


class MemberListOut(BaseModel):
    id: int
    username: str
    first_name: str
    middle_name: Optional[str]
    last_name: str
    status: str
    gender: Optional[str]
    district: Optional[str]
    email: Optional[EmailStr]
    phone: Optional[str]
    avatar_path: Optional[str]

    class Config:
        from_attributes = True


class MemberDetailOut(MemberListOut):
    birth_date: Optional[date]
    join_date: Optional[date]
    address: Optional[str]
    is_tither: bool
    contribution_method: Optional[str]
    contribution_amount: Optional[float]
    notes: Optional[str]
    spouse: Optional[SpouseOut]
    children: List[ChildOut]
    household: Optional[HouseholdOut]
    tags: List[TagOut]
    ministries: List[MinistryOut]
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
