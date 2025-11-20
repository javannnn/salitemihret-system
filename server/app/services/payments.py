from __future__ import annotations

from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Query, Session, selectinload

from app.models.member import Member
from app.models.payment import Payment, PaymentServiceType
from app.models.payment_day_lock import PaymentDayLock
from app.models.user import User
from app.schemas.payment import (
    PaymentCreate,
    PaymentCorrectionCreate,
    PaymentListResponse,
    PaymentOut,
    PaymentSummaryItem,
    PaymentSummaryResponse,
    PaymentServiceTypeOut,
    PaymentStatusUpdate,
    PaymentStatus,
)
from app.services.membership import apply_contribution_payment

DEFAULT_PAYMENT_SERVICE_TYPES: tuple[dict[str, str], ...] = (
    {
        "code": "CONTRIBUTION",
        "label": "Monthly Contribution",
        "description": "Standard parish contribution or household dues.",
    },
    {
        "code": "TITHE",
        "label": "Tithe",
        "description": "Tithes recorded outside the automated contribution flow.",
    },
    {
        "code": "DONATION",
        "label": "General Donation",
        "description": "One-time gifts, fundraisers, or special appeals.",
    },
    {
        "code": "SCHOOLFEE",
        "label": "Sunday School Fee",
        "description": "Fees for Sunday School or youth formation programs.",
    },
    {
        "code": "SPONSORSHIP",
        "label": "Sponsorship Donation",
        "description": "Funds tied to sponsorship pledges or newcomer support.",
    },
    {
        "code": "AbenetSchool",
        "label": "Abenet School Tuition",
        "description": "Tuition payments for the Abenet literacy and deacons track.",
    },
)


def ensure_default_service_types(db: Session) -> None:
    """Insert baseline payment service types if the table is empty or missing required codes."""
    existing_codes = {
        code for (code,) in db.query(PaymentServiceType.code).all()
    }
    missing = [
        payload for payload in DEFAULT_PAYMENT_SERVICE_TYPES if payload["code"] not in existing_codes
    ]
    if not missing:
        return
    for payload in missing:
        db.add(PaymentServiceType(**payload))
    db.commit()


def _get_service_type(db: Session, code: str, active_only: bool = True) -> PaymentServiceType:
    query = db.query(PaymentServiceType).filter(PaymentServiceType.code == code)
    if active_only:
        query = query.filter(PaymentServiceType.active.is_(True))
    service_type = query.first()
    if not service_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive service type code")
    return service_type


def _resolve_member(db: Session, member_id: Optional[int]) -> Optional[Member]:
    if member_id is None:
        return None
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member not found")
    return member


def _normalize_status(payload_status: Optional[PaymentStatus], due_date: Optional[date]) -> PaymentStatus:
    if payload_status:
        return payload_status
    if due_date and due_date > date.today():
        return "Pending"
    return "Completed"


def _base_payment_query(db: Session) -> Query:
    return (
        db.query(Payment)
        .options(
            selectinload(Payment.service_type),
            selectinload(Payment.member),
            selectinload(Payment.household),
            selectinload(Payment.receipts),
            selectinload(Payment.recorded_by),
        )
        .order_by(Payment.posted_at.desc(), Payment.id.desc())
    )


def _apply_payment_filters(
    db: Session,
    query: Query,
    *,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> Query:
    if member_id:
        query = query.filter(Payment.member_id == member_id)
    if service_type_code:
        service_type = _get_service_type(db, service_type_code, active_only=False)
        query = query.filter(Payment.service_type_id == service_type.id)
    if start_date:
        query = query.filter(Payment.posted_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc))
    if end_date:
        query = query.filter(
            Payment.posted_at
            <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
        )
    if method:
        query = query.filter(func.lower(Payment.method) == method.lower())
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    return query


def _normalize_day(value: datetime) -> date:
    return value.astimezone(timezone.utc).date()


def _ensure_unlocked(db: Session, day: date) -> None:
    lock = db.get(PaymentDayLock, day)
    if lock and lock.locked and lock.unlocked_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payments for {day.isoformat()} have been closed. Please unlock the day before recording new entries.",
        )


def record_payment(db: Session, payload: PaymentCreate, actor: User | None, *, auto_commit: bool = True) -> Payment:
    service_type = _get_service_type(db, payload.service_type_code)
    member = _resolve_member(db, payload.member_id)
    posted_at = payload.posted_at or datetime.now(timezone.utc)
    status = _normalize_status(payload.status, payload.due_date)
    _ensure_unlocked(db, _normalize_day(posted_at))
    payment = Payment(
        amount=payload.amount,
        currency=(payload.currency or "CAD").upper(),
        method=payload.method,
        memo=payload.memo,
        service_type_id=service_type.id,
        member_id=member.id if member else None,
        household_id=member.household_id if member else payload.household_id,
        recorded_by_id=actor.id if actor else None,
        posted_at=posted_at,
        due_date=payload.due_date,
        status=status,
    )
    db.add(payment)
    db.flush()
    if member and service_type.code == "CONTRIBUTION":
        apply_contribution_payment(member, amount=Decimal(str(payment.amount)), posted_at=posted_at)
    if auto_commit:
        db.commit()
    db.refresh(payment)
    return payment


def list_payments(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 25,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> PaymentListResponse:
    query = _apply_payment_filters(
        db,
        _base_payment_query(db),
        member_id=member_id,
        service_type_code=service_type_code,
        start_date=start_date,
        end_date=end_date,
        method=method,
        status_filter=status_filter,
    )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return PaymentListResponse(
        items=[PaymentOut.from_orm(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_payment(db: Session, payment_id: int) -> Payment:
    payment = (
        db.query(Payment)
        .options(
            selectinload(Payment.service_type),
            selectinload(Payment.member),
            selectinload(Payment.household),
            selectinload(Payment.receipts),
        )
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def request_correction(db: Session, payment_id: int, payload: PaymentCorrectionCreate, actor: User) -> Payment:
    original = get_payment(db, payment_id)
    if original.correction_of_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot correct a correction entry")
    if original.corrections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A correction already exists for this payment")

    correction_posted_at = datetime.now(timezone.utc)
    _ensure_unlocked(db, _normalize_day(correction_posted_at))
    correction = Payment(
        amount=-original.amount,
        currency=original.currency,
        method=original.method,
        memo=original.memo,
        service_type_id=original.service_type_id,
        member_id=original.member_id,
        household_id=original.household_id,
        recorded_by_id=actor.id if actor else None,
        posted_at=correction_posted_at,
        correction_of_id=original.id,
        correction_reason=payload.correction_reason,
        status="Completed",
    )
    db.add(correction)
    db.commit()
    db.refresh(correction)
    return correction


def summarize_payments(
    db: Session,
    *,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> PaymentSummaryResponse:
    query = (
        db.query(
            Payment.service_type_id,
            func.sum(Payment.amount).label("total_amount"),
            func.min(Payment.currency).label("currency"),
        )
        .group_by(Payment.service_type_id)
    )
    if start_date:
        query = query.filter(Payment.posted_at >= datetime.combine(start_date, datetime.min.time(), tzinfo=timezone.utc))
    if end_date:
        query = query.filter(
            Payment.posted_at
            <= datetime.combine(end_date, datetime.max.time(), tzinfo=timezone.utc)
        )

    rows = query.all()
    items: list[PaymentSummaryItem] = []
    grand_total = Decimal("0.00")
    for row in rows:
        service_type = db.get(PaymentServiceType, row.service_type_id)
        total_amount = row.total_amount or Decimal("0.00")
        grand_total += total_amount
        items.append(
            PaymentSummaryItem(
                service_type_code=service_type.code if service_type else "",
                service_type_label=service_type.label if service_type else "",
                total_amount=total_amount,
                currency=row.currency or "CAD",
            )
        )
    return PaymentSummaryResponse(items=items, grand_total=grand_total)


def list_service_types(db: Session, include_inactive: bool = False) -> list[PaymentServiceTypeOut]:
    ensure_default_service_types(db)
    query = db.query(PaymentServiceType)
    if not include_inactive:
        query = query.filter(PaymentServiceType.active.is_(True))
    query = query.order_by(PaymentServiceType.label.asc())
    return [PaymentServiceTypeOut.from_orm(record) for record in query.all()]


def update_payment_status(db: Session, payment_id: int, payload: PaymentStatusUpdate, actor: User) -> Payment:
    payment = get_payment(db, payment_id)
    if payment.correction_of_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot update status for correction entries")
    payment.status = payload.status
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def get_payments_for_export(
    db: Session,
    *,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
) -> list[Payment]:
    query = _apply_payment_filters(
        db,
        _base_payment_query(db),
        member_id=member_id,
        service_type_code=service_type_code,
        start_date=start_date,
        end_date=end_date,
        method=method,
        status_filter=status_filter,
    )
    return query.all()


def check_overdue_payments(db: Session) -> int:
    today = date.today()
    pending = (
        db.query(Payment)
        .filter(
            Payment.status == "Pending",
            Payment.due_date.isnot(None),
            Payment.due_date < today,
        )
        .all()
    )
    count = 0
    for payment in pending:
        payment.status = "Overdue"
        db.add(payment)
        from app.services.notifications import notify_payment_overdue

        notify_payment_overdue(payment)
        count += 1
    if count:
        db.commit()
    return count


def list_day_locks(db: Session, *, limit: int = 14) -> list[PaymentDayLock]:
    return (
        db.query(PaymentDayLock)
        .order_by(PaymentDayLock.day.desc())
        .limit(limit)
        .all()
    )


def lock_payment_day(db: Session, day: date, actor: User | None) -> PaymentDayLock:
    existing = db.get(PaymentDayLock, day)
    if existing and existing.locked and existing.unlocked_at is None:
        return existing
    if existing and existing.unlocked_at is not None:
        existing.locked = True
        existing.locked_at = datetime.now(timezone.utc)
        existing.locked_by_id = actor.id if actor else None
        existing.unlocked_at = None
        existing.unlocked_by_id = None
        existing.unlock_reason = None
        db.add(existing)
        db.commit()
        db.refresh(existing)
        from app.services.notifications import notify_payment_day_locked

        notify_payment_day_locked(existing)
        return existing
    lock = PaymentDayLock(
        day=day,
        locked=True,
        locked_at=datetime.now(timezone.utc),
        locked_by_id=actor.id if actor else None,
    )
    db.add(lock)
    db.commit()
    db.refresh(lock)
    from app.services.notifications import notify_payment_day_locked

    notify_payment_day_locked(lock)
    return lock


def unlock_payment_day(db: Session, day: date, actor: User, reason: str) -> PaymentDayLock:
    lock = db.get(PaymentDayLock, day)
    if lock is None or lock.unlocked_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Day is not currently locked")
    lock.locked = False
    lock.unlocked_at = datetime.now(timezone.utc)
    lock.unlocked_by_id = actor.id
    lock.unlock_reason = reason
    db.add(lock)
    db.commit()
    db.refresh(lock)
    from app.services.notifications import notify_payment_day_unlocked

    notify_payment_day_unlocked(lock)
    return lock


def auto_close_previous_day(db: Session) -> PaymentDayLock | None:
    target_day = date.today() - timedelta(days=1)
    lock = db.get(PaymentDayLock, target_day)
    if lock and lock.locked and lock.unlocked_at is None:
        return lock
    return lock_payment_day(db, target_day, actor=None)
