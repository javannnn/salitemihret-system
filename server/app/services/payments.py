from __future__ import annotations

from dataclasses import dataclass
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
from app.services.membership import MembershipHealthData, apply_contribution_payment
from app.services.notifications import notify_membership_status_change

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

PAYMENT_METHOD_ALIASES: dict[str, list[str]] = {
    "debit card": ["debit card", "debit"],
    "credit card": ["credit card", "credit"],
    "check": ["check", "cheque"],
    "cheque": ["cheque", "check"],
}


@dataclass
class PaymentAdjustmentOutcome:
    original: Payment
    reversal: Payment
    replacement: Payment | None
    reason: str


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
            selectinload(Payment.corrections),
        )
        .order_by(Payment.posted_at.desc(), Payment.id.desc())
    )


def _apply_payment_filters(
    db: Session,
    query: Query,
    *,
    reference: Optional[int] = None,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
    member_name: Optional[str] = None,
) -> Query:
    if reference:
        query = query.filter(Payment.id == reference)
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
        normalized = method.strip().lower()
        variants = PAYMENT_METHOD_ALIASES.get(normalized, [normalized])
        query = query.filter(func.lower(Payment.method).in_(variants))
    if status_filter:
        query = query.filter(Payment.status == status_filter)
    if member_name:
        search = f"%{member_name}%"
        query = query.join(Member).filter(
            (Member.first_name.ilike(search)) | (Member.last_name.ilike(search))
        )
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


def _build_payment(
    db: Session,
    payload: PaymentCreate,
    actor: User | None,
    *,
    correction_of_id: int | None = None,
    correction_reason: str | None = None,
) -> tuple[Payment, Optional[Member], datetime, PaymentServiceType]:
    service_type = _get_service_type(db, payload.service_type_code)
    member = _resolve_member(db, payload.member_id)
    posted_at = payload.posted_at or datetime.now(timezone.utc)
    status = _normalize_status(payload.status, payload.due_date)
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
        correction_of_id=correction_of_id,
        correction_reason=correction_reason,
    )
    return payment, member, posted_at, service_type


def record_payment(db: Session, payload: PaymentCreate, actor: User | None, *, auto_commit: bool = True) -> Payment:
    payment, member, posted_at, service_type = _build_payment(db, payload, actor)
    _ensure_unlocked(db, _normalize_day(posted_at))
    db.add(payment)
    db.flush()
    membership_status_payload: tuple[Member, str | None, MembershipHealthData] | None = None
    if member and service_type.code == "CONTRIBUTION":
        previous_auto_status = member.status_auto
        health = apply_contribution_payment(member, amount=Decimal(str(payment.amount)), posted_at=posted_at)
        membership_status_payload = (member, previous_auto_status, health)
    if auto_commit:
        db.commit()
        if membership_status_payload:
            member_ref, previous_status, health = membership_status_payload
            notify_membership_status_change(
                db,
                member_ref,
                previous_status=previous_status,
                current_status=health.auto_status,
                consecutive_months=health.consecutive_months,
                required_months=health.required_consecutive_months,
                next_due_at=health.next_due_at,
                overdue_days=health.overdue_days,
                actor=actor,
            )
    db.refresh(payment)
    return payment


def list_payments(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 25,
    reference: Optional[int] = None,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
    member_name: Optional[str] = None,
) -> PaymentListResponse:
    query = _apply_payment_filters(
        db,
        _base_payment_query(db),
        reference=reference,
        member_id=member_id,
        service_type_code=service_type_code,
        start_date=start_date,
        end_date=end_date,
        method=method,
        status_filter=status_filter,
        member_name=member_name,
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
            selectinload(Payment.recorded_by),
            selectinload(Payment.corrections),
        )
        .filter(Payment.id == payment_id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")
    return payment


def _load_payments(db: Session, payment_ids: list[int]) -> list[Payment]:
    payments = (
        db.query(Payment)
        .options(
            selectinload(Payment.service_type),
            selectinload(Payment.member),
            selectinload(Payment.household),
            selectinload(Payment.receipts),
            selectinload(Payment.recorded_by),
            selectinload(Payment.corrections),
        )
        .filter(Payment.id.in_(payment_ids))
        .all()
    )
    payment_by_id = {payment.id: payment for payment in payments}
    missing_ids = [payment_id for payment_id in payment_ids if payment_id not in payment_by_id]
    if missing_ids:
        refs = ", ".join(f"PAY-{payment_id:06d}" for payment_id in missing_ids)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payments not found: {refs}")
    return [payment_by_id[payment_id] for payment_id in payment_ids]


def _ensure_payment_adjustable(payment: Payment) -> None:
    if payment.correction_of_id is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot adjust a reversal or replacement entry")
    if payment.corrections:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This payment already has a recorded adjustment")


def _create_reversal_entry(db: Session, original: Payment, reason: str, actor: User, posted_at: datetime) -> Payment:
    _ensure_unlocked(db, _normalize_day(posted_at))
    reversal = Payment(
        amount=-original.amount,
        currency=original.currency,
        method=original.method,
        memo=original.memo,
        service_type_id=original.service_type_id,
        member_id=original.member_id,
        household_id=original.household_id,
        recorded_by_id=actor.id if actor else None,
        posted_at=posted_at,
        due_date=original.due_date,
        correction_of_id=original.id,
        correction_reason=reason,
        status="Completed",
    )
    db.add(reversal)
    db.flush()
    return reversal


def request_correction(db: Session, payment_id: int, payload: PaymentCorrectionCreate, actor: User) -> PaymentAdjustmentOutcome:
    original = get_payment(db, payment_id)
    _ensure_payment_adjustable(original)

    correction_posted_at = datetime.now(timezone.utc)
    reversal = _create_reversal_entry(db, original, payload.correction_reason, actor, correction_posted_at)

    replacement: Payment | None = None
    if payload.replacement is not None:
        replacement_payload = payload.replacement.copy(
            update={
                "member_id": payload.replacement.member_id if payload.replacement.member_id is not None else original.member_id,
                "household_id": payload.replacement.household_id if payload.replacement.household_id is not None else original.household_id,
            }
        )
        replacement_payment, _, replacement_posted_at, _ = _build_payment(
            db,
            replacement_payload,
            actor,
            correction_of_id=original.id,
            correction_reason=payload.correction_reason,
        )
        _ensure_unlocked(db, _normalize_day(replacement_posted_at))
        db.add(replacement_payment)
        db.flush()
        replacement = replacement_payment

    db.commit()
    db.refresh(original)
    db.refresh(reversal)
    if replacement is not None:
        db.refresh(replacement)
    return PaymentAdjustmentOutcome(
        original=original,
        reversal=reversal,
        replacement=replacement,
        reason=payload.correction_reason,
    )


def void_payment(db: Session, payment_id: int, reason: str, actor: User) -> PaymentAdjustmentOutcome:
    original = get_payment(db, payment_id)
    _ensure_payment_adjustable(original)

    reversal = _create_reversal_entry(db, original, reason, actor, datetime.now(timezone.utc))
    db.commit()
    db.refresh(original)
    db.refresh(reversal)
    return PaymentAdjustmentOutcome(
        original=original,
        reversal=reversal,
        replacement=None,
        reason=reason,
    )


def void_payments(db: Session, payment_ids: list[int], reason: str, actor: User) -> list[PaymentAdjustmentOutcome]:
    unique_ids = list(dict.fromkeys(payment_ids))
    originals = _load_payments(db, unique_ids)

    blocking_reasons: list[str] = []
    for original in originals:
        try:
            _ensure_payment_adjustable(original)
        except HTTPException as exc:
            blocking_reasons.append(f"PAY-{original.id:06d}: {exc.detail}")
    if blocking_reasons:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete the selected payments. " + " ".join(blocking_reasons),
        )

    posted_at = datetime.now(timezone.utc)
    outcomes: list[PaymentAdjustmentOutcome] = []
    for original in originals:
        reversal = _create_reversal_entry(db, original, reason, actor, posted_at)
        outcomes.append(
            PaymentAdjustmentOutcome(
                original=original,
                reversal=reversal,
                replacement=None,
                reason=reason,
            )
        )

    db.commit()
    for outcome in outcomes:
        db.refresh(outcome.original)
        db.refresh(outcome.reversal)
    return outcomes


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
    reference: Optional[int] = None,
    member_id: Optional[int] = None,
    service_type_code: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    method: Optional[str] = None,
    status_filter: Optional[str] = None,
    member_name: Optional[str] = None,
) -> list[Payment]:
    query = _apply_payment_filters(
        db,
        _base_payment_query(db),
        reference=reference,
        member_id=member_id,
        service_type_code=service_type_code,
        start_date=start_date,
        end_date=end_date,
        method=method,
        status_filter=status_filter,
        member_name=member_name,
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
