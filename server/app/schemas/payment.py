from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


PaymentStatus = Literal["Pending", "Completed", "Overdue"]


class PaymentServiceTypeBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    label: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = Field(None, max_length=255)


class PaymentServiceTypeCreate(PaymentServiceTypeBase):
    active: bool = True


class PaymentServiceTypeOut(PaymentServiceTypeBase):
    id: int
    active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentReceiptOut(BaseModel):
    id: int
    payment_id: int
    reference_number: Optional[str]
    attachment_path: Optional[str]
    issued_at: datetime

    class Config:
        from_attributes = True


class PaymentMemberOut(BaseModel):
    id: int
    first_name: str
    last_name: str
    email: Optional[str]

    class Config:
        from_attributes = True


class PaymentHouseholdOut(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class PaymentBase(BaseModel):
    amount: Decimal = Field(..., gt=0)
    currency: str = Field("CAD", min_length=3, max_length=3)
    method: Optional[str] = Field(None, max_length=100)
    memo: Optional[str] = Field(None, max_length=255)
    service_type_code: str = Field(..., min_length=1, max_length=50)
    member_id: Optional[int] = None
    household_id: Optional[int] = None
    posted_at: Optional[datetime] = None
    due_date: Optional[date] = None
    status: Optional[PaymentStatus] = None


class PaymentCreate(PaymentBase):
    pass


class PaymentCorrectionCreate(BaseModel):
    correction_reason: str = Field(..., min_length=5, max_length=500)


class PaymentOut(BaseModel):
    id: int
    amount: Decimal
    currency: str
    method: Optional[str]
    memo: Optional[str]
    posted_at: datetime
    member_id: Optional[int]
    household_id: Optional[int]
    recorded_by_id: Optional[int]
    correction_of_id: Optional[int]
    correction_reason: Optional[str]
    due_date: Optional[date]
    status: PaymentStatus
    created_at: datetime
    updated_at: datetime
    service_type: PaymentServiceTypeOut
    receipts: List[PaymentReceiptOut] = Field(default_factory=list)
    member: Optional[PaymentMemberOut] = None
    household: Optional[PaymentHouseholdOut] = None

    class Config:
        from_attributes = True


class PaymentListResponse(BaseModel):
    items: List[PaymentOut]
    total: int
    page: int
    page_size: int


class PaymentSummaryItem(BaseModel):
    service_type_code: str
    service_type_label: str
    total_amount: Decimal
    currency: str


class PaymentSummaryResponse(BaseModel):
    items: List[PaymentSummaryItem]
    grand_total: Decimal


class PaymentStatusUpdate(BaseModel):
    status: PaymentStatus


class PaymentDayLockOut(BaseModel):
    day: date
    locked: bool
    locked_at: datetime
    locked_by: Optional[str]
    unlocked_at: Optional[datetime]
    unlocked_by: Optional[str]
    unlock_reason: Optional[str]

    class Config:
        from_attributes = True


class PaymentDayLockRequest(BaseModel):
    day: Optional[date] = None


class PaymentDayUnlockRequest(BaseModel):
    reason: str = Field(..., min_length=5, max_length=255)
