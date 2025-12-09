from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_roles
from app.core.db import get_db
from app.models.user import User
from app.models.payment import Payment
from app.models.payment_day_lock import PaymentDayLock
from app.schemas.payment import (
    PaymentCorrectionCreate,
    PaymentCreate,
    PaymentDayLockOut,
    PaymentDayLockRequest,
    PaymentDayUnlockRequest,
    PaymentListResponse,
    PaymentOut,
    PaymentSummaryResponse,
    PaymentServiceTypeOut,
    PaymentStatusUpdate,
)
from app.services import payments as payments_service

router = APIRouter(prefix="/payments", tags=["payments"])

FINANCE_ROLES = ("FinanceAdmin", "Admin")
VIEW_ROLES = ("FinanceAdmin", "Admin", "OfficeAdmin")
DONATION_ROLES = FINANCE_ROLES

PAYMENT_EXPORT_HEADERS = [
    "payment_id",
    "posted_at",
    "due_date",
    "status",
    "amount",
    "currency",
    "method",
    "service_type_code",
    "service_type_label",
    "member_id",
    "member_first_name",
    "member_last_name",
    "member_email",
    "household_name",
    "memo",
    "recorded_by_id",
]


def _format_datetime(value: Optional[datetime]) -> str:
    return value.isoformat() if value else ""


def _format_date(value: Optional[date]) -> str:
    return value.isoformat() if value else ""


def _format_payment_row(payment: "Payment") -> list[str]:
    member = payment.member
    household = payment.household
    service_type = payment.service_type
    recorded_by = payment.recorded_by
    amount = f"{payment.amount:.2f}" if payment.amount is not None else ""
    return [
        str(payment.id),
        _format_datetime(payment.posted_at),
        _format_date(payment.due_date),
        payment.status,
        amount,
        payment.currency or "",
        payment.method or "",
        service_type.code if service_type else "",
        service_type.label if service_type else "",
        str(member.id) if member else "",
        member.first_name if member else "",
        member.last_name if member else "",
        member.email if member and member.email else "",
        household.name if household else "",
        payment.memo or "",
        str(recorded_by.id) if recorded_by else "",
    ]


def _stream_payment_csv(rows: Iterable[list[str]]) -> Iterable[str]:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(PAYMENT_EXPORT_HEADERS)
    yield buffer.getvalue()
    buffer.seek(0)
    buffer.truncate(0)
    for row in rows:
        writer.writerow(row)
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)


@router.get("", response_model=PaymentListResponse, status_code=status.HTTP_200_OK)
def list_payments(
    *,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    reference: str | None = Query(default=None),
    member_id: Optional[int] = Query(default=None),
    service_type: Optional[str] = Query(default=None),
    method: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    member_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> PaymentListResponse:
    ref_id: int | None = None
    if reference:
        cleaned = "".join(ch for ch in reference if ch.isdigit())
        if not cleaned:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reference must include digits")
        ref_id = int(cleaned)
    return payments_service.list_payments(
        db,
        page=page,
        page_size=page_size,
        reference=ref_id,
        member_id=member_id,
        service_type_code=service_type,
        method=method,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def create_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*DONATION_ROLES)),
) -> PaymentOut:
    payment = payments_service.record_payment(db, payload, current_user)
    return PaymentOut.from_orm(payment)


@router.get("/service-types", response_model=list[PaymentServiceTypeOut], status_code=status.HTTP_200_OK)
def list_payment_service_types(
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> list[PaymentServiceTypeOut]:
    return payments_service.list_service_types(db, include_inactive=include_inactive)


@router.get("/export.csv", status_code=status.HTTP_200_OK)
def export_payments_report(
    *,
    reference: str | None = Query(default=None),
    member_id: Optional[int] = Query(default=None),
    service_type: Optional[str] = Query(default=None),
    method: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    member_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> StreamingResponse:
    ref_id: int | None = None
    if reference:
        cleaned = "".join(ch for ch in reference if ch.isdigit())
        if not cleaned:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reference must include digits")
        ref_id = int(cleaned)
    payments = payments_service.get_payments_for_export(
        db,
        reference=ref_id,
        member_id=member_id,
        service_type_code=service_type,
        method=method,
        status_filter=status_filter,
        start_date=start_date,
        end_date=end_date,
    )
    rows = (_format_payment_row(payment) for payment in payments)
    response = StreamingResponse(_stream_payment_csv(rows), media_type="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=payments_report.csv"
    return response


def _lock_to_schema(lock: PaymentDayLock) -> PaymentDayLockOut:
    return PaymentDayLockOut(
        day=lock.day,
        locked=lock.locked,
        locked_at=lock.locked_at,
        locked_by=lock.locked_by.full_name if getattr(lock, "locked_by", None) else None,
        unlocked_at=lock.unlocked_at,
        unlocked_by=lock.unlocked_by.full_name if getattr(lock, "unlocked_by", None) else None,
        unlock_reason=lock.unlock_reason,
    )


@router.get("/{payment_id:int}", response_model=PaymentOut, status_code=status.HTTP_200_OK)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> PaymentOut:
    payment = payments_service.get_payment(db, payment_id)
    return PaymentOut.from_orm(payment)


@router.post("/{payment_id:int}/correct", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
def correct_payment(
    payment_id: int,
    payload: PaymentCorrectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FINANCE_ROLES)),
) -> PaymentOut:
    correction = payments_service.request_correction(db, payment_id, payload, current_user)
    return PaymentOut.from_orm(correction)


@router.get("/reports/summary", response_model=PaymentSummaryResponse, status_code=status.HTTP_200_OK)
def payments_summary(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*VIEW_ROLES)),
) -> PaymentSummaryResponse:
    return payments_service.summarize_payments(db, start_date=start_date, end_date=end_date)


@router.post("/{payment_id:int}/status", response_model=PaymentOut, status_code=status.HTTP_200_OK)
def update_payment_status(
    payment_id: int,
    payload: PaymentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FINANCE_ROLES)),
) -> PaymentOut:
    payment = payments_service.update_payment_status(db, payment_id, payload, current_user)
    return PaymentOut.from_orm(payment)


@router.get("/locks", response_model=list[PaymentDayLockOut], status_code=status.HTTP_200_OK)
def list_payment_locks(
    limit: int = Query(14, ge=1, le=60),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(*FINANCE_ROLES)),
) -> list[PaymentDayLockOut]:
    locks = payments_service.list_day_locks(db, limit=limit)
    return [_lock_to_schema(lock) for lock in locks]


@router.post("/locks", response_model=PaymentDayLockOut, status_code=status.HTTP_201_CREATED)
def lock_payment_day_endpoint(
    payload: PaymentDayLockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FINANCE_ROLES)),
) -> PaymentDayLockOut:
    target = payload.day or (date.today() - timedelta(days=1))
    lock = payments_service.lock_payment_day(db, target, current_user)
    return _lock_to_schema(lock)


@router.post("/locks/{lock_day}/unlock", response_model=PaymentDayLockOut, status_code=status.HTTP_200_OK)
def unlock_payment_day_endpoint(
    lock_day: date,
    payload: PaymentDayUnlockRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FINANCE_ROLES)),
) -> PaymentDayLockOut:
    lock = payments_service.unlock_payment_day(db, lock_day, current_user, payload.reason)
    return _lock_to_schema(lock)
