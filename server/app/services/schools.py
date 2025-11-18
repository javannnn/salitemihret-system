from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.member import Child, Member
from app.models.payment import Payment
from app.models.schools import AbenetEnrollment, AbenetEnrollmentPayment, Lesson, Mezmur
from app.models.user import User
from app.schemas.member import ALLOWED_CONTRIBUTION_METHODS
from app.schemas.payment import PaymentCreate
from app.schemas.schools import (
    AbenetEnrollmentCreate,
    AbenetEnrollmentList,
    AbenetEnrollmentOut,
    AbenetEnrollmentUpdate,
    AbenetPaymentCreate,
    AbenetReportRow,
    LessonOut,
    MezmurOut,
    SchoolsMeta,
)
from app.services import payments as payment_service

ABENET_SERVICE_CODE = "AbenetSchool"


def _load_member(db: Session, member_id: int) -> Member:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return member


def _resolve_child(db: Session, parent: Member, payload: AbenetEnrollmentCreate) -> Child | None:
    if payload.child_id:
        child = (
            db.query(Child)
            .filter(Child.id == payload.child_id, Child.member_id == parent.id)
            .first()
        )
        if not child:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child record not found under this parent")
        return child

    first = payload.child_first_name.strip()
    last = payload.child_last_name.strip()
    child = Child(
        first_name=first,
        last_name=last,
        full_name=f"{first} {last}".strip(),
        birth_date=payload.birth_date,
    )
    parent.children_all.append(child)
    db.flush()
    return child


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split(" ") if part]
    if not parts:
        return ("Child", "Child")
    if len(parts) == 1:
        return (parts[0], parts[0])
    return (parts[0], parts[-1])


def _child_identity(child: Child | None, payload: AbenetEnrollmentCreate) -> tuple[str, str, date]:
    if child:
        first = child.first_name or _split_name(child.full_name)[0]
        last = child.last_name or _split_name(child.full_name)[1]
        birth = child.birth_date or payload.birth_date
        return first.strip(), last.strip(), birth
    return payload.child_first_name.strip(), payload.child_last_name.strip(), payload.birth_date


def _validate_payment_method(method: str | None) -> str:
    if not method:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a payment method before recording payment")
    if method not in ALLOWED_CONTRIBUTION_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported payment method.")
    return method


def _coerce_payment_amount(amount: float | Decimal | None) -> Decimal:
    target = settings.ABENET_MONTHLY_AMOUNT
    if amount is None:
        return target
    candidate = Decimal(str(amount))
    if candidate != target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Abenet tuition is fixed at {target:.2f} CAD.",
        )
    return target


def _serialize_abenet(record: AbenetEnrollment) -> AbenetEnrollmentOut:
    parent = record.parent
    child_payload = {
        "id": record.child.id if record.child else None,
        "first_name": record.child_first_name,
        "last_name": record.child_last_name,
    }
    parent_payload = {
        "id": parent.id,
        "first_name": parent.first_name,
        "last_name": parent.last_name,
    }
    return AbenetEnrollmentOut(
        id=record.id,
        parent=parent_payload,
        child=child_payload,
        service_stage=record.service_stage,
        status=record.status,
        monthly_amount=float(record.monthly_amount or Decimal("0.00")),
        enrollment_date=record.enrollment_date,
        last_payment_at=record.last_payment_at,
        notes=record.notes,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def list_lessons(db: Session, level: str | None = None) -> list[LessonOut]:
    query = db.query(Lesson)
    if level:
        query = query.filter(Lesson.level == level)
    lessons = query.order_by(Lesson.lesson_code).all()
    return [LessonOut.from_orm(lesson) for lesson in lessons]


def list_mezmur(db: Session) -> list[MezmurOut]:
    return [MezmurOut.from_orm(item) for item in db.query(Mezmur).order_by(Mezmur.code).all()]


def _find_open_invoice(db: Session, enrollment_id: int) -> AbenetEnrollmentPayment | None:
    return (
        db.query(AbenetEnrollmentPayment)
        .join(Payment)
        .filter(
            AbenetEnrollmentPayment.enrollment_id == enrollment_id,
            Payment.status.in_(("Pending", "Overdue")),
        )
        .order_by(Payment.due_date.asc(), Payment.id.asc())
        .first()
    )


def _create_pending_invoice(db: Session, enrollment: AbenetEnrollment, actor: User | None) -> None:
    if _find_open_invoice(db, enrollment.id):
        return
    memo = f"Pending Abenet tuition for {enrollment.child_first_name} {enrollment.child_last_name}".strip()
    payload = PaymentCreate(
        amount=settings.ABENET_MONTHLY_AMOUNT,
        currency="CAD",
        method=None,
        memo=memo,
        service_type_code=ABENET_SERVICE_CODE,
        member_id=enrollment.parent_member_id,
        status="Pending",
        due_date=enrollment.enrollment_date,
    )
    payment = payment_service.record_payment(db, payload, actor, auto_commit=False)
    db.add(AbenetEnrollmentPayment(enrollment_id=enrollment.id, payment_id=payment.id))


def list_abenet_enrollments(
    db: Session,
    *,
    page: int,
    page_size: int,
    service_stage: str | None = None,
    status_filter: str | None = None,
    q: str | None = None,
) -> AbenetEnrollmentList:
    query = (
        db.query(AbenetEnrollment)
        .options(selectinload(AbenetEnrollment.parent), selectinload(AbenetEnrollment.child))
        .order_by(AbenetEnrollment.updated_at.desc())
    )
    if service_stage:
        query = query.filter(AbenetEnrollment.service_stage == service_stage)
    if status_filter:
        query = query.filter(AbenetEnrollment.status == status_filter)
    if q:
        like = f"%{q.lower()}%"
        query = query.join(AbenetEnrollment.parent).filter(
            or_(
                func.lower(AbenetEnrollment.child_first_name).like(like),
                func.lower(AbenetEnrollment.child_last_name).like(like),
                func.lower(Member.first_name).like(like),
                func.lower(Member.last_name).like(like),
                func.lower(Member.username).like(like),
            )
        )

    total = query.count()
    records = query.offset((page - 1) * page_size).limit(page_size).all()
    items = [_serialize_abenet(record) for record in records]
    return AbenetEnrollmentList(items=items, total=total, page=page, page_size=page_size)


def create_abenet_enrollment(db: Session, payload: AbenetEnrollmentCreate, actor: User) -> AbenetEnrollmentOut:
    parent = _load_member(db, payload.parent_member_id)
    child = _resolve_child(db, parent, payload)
    first_name, last_name, birth_date = _child_identity(child, payload)

    record = AbenetEnrollment(
        parent_member_id=parent.id,
        child_id=child.id if child else None,
        child_first_name=first_name,
        child_last_name=last_name,
        birth_date=birth_date,
        service_stage=payload.service_stage,
        monthly_amount=settings.ABENET_MONTHLY_AMOUNT,
        status="Active",
        enrollment_date=payload.enrollment_date,
        notes=payload.notes,
    )
    db.add(record)
    db.flush()
    _create_pending_invoice(db, record, actor)
    db.commit()
    db.refresh(record)
    return _serialize_abenet(record)


def update_abenet_enrollment(
    db: Session,
    enrollment_id: int,
    payload: AbenetEnrollmentUpdate,
) -> AbenetEnrollmentOut:
    record = (
        db.query(AbenetEnrollment)
        .options(selectinload(AbenetEnrollment.parent), selectinload(AbenetEnrollment.child))
        .filter(AbenetEnrollment.id == enrollment_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Abenet enrollment not found")

    if payload.service_stage is not None:
        record.service_stage = payload.service_stage
    if payload.status is not None:
        record.status = payload.status
    if payload.enrollment_date is not None:
        record.enrollment_date = payload.enrollment_date
    if payload.notes is not None:
        record.notes = payload.notes

    db.commit()
    db.refresh(record)
    return _serialize_abenet(record)


def record_abenet_payment(
    db: Session,
    enrollment_id: int,
    payload: AbenetPaymentCreate,
    actor: User,
) -> AbenetEnrollmentOut:
    enrollment = (
        db.query(AbenetEnrollment)
        .options(selectinload(AbenetEnrollment.parent))
        .filter(AbenetEnrollment.id == enrollment_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")

    amount = _coerce_payment_amount(payload.amount)
    method = _validate_payment_method(payload.method)
    memo = payload.memo or f"Abenet tuition for {enrollment.child_first_name} {enrollment.child_last_name}".strip()

    open_invoice = _find_open_invoice(db, enrollment.id)
    if open_invoice:
        payment = open_invoice.payment
        payment.amount = amount
        payment.method = method
        payment.memo = memo
        payment.status = "Completed"
        payment.posted_at = datetime.now(timezone.utc)
        payment.recorded_by_id = actor.id if actor else None
        db.add(payment)
    else:
        payment_payload = PaymentCreate(
            amount=amount,
            currency="CAD",
            method=method,
            memo=memo,
            service_type_code=ABENET_SERVICE_CODE,
            member_id=enrollment.parent_member_id,
            status="Completed",
            due_date=date.today(),
        )
        payment = payment_service.record_payment(db, payment_payload, actor, auto_commit=False)
        db.add(AbenetEnrollmentPayment(enrollment_id=enrollment.id, payment_id=payment.id))

    enrollment.last_payment_at = payment.posted_at
    db.commit()
    db.refresh(enrollment)
    return _serialize_abenet(enrollment)


def list_abenet_report(db: Session) -> list[AbenetReportRow]:
    rows: list[AbenetReportRow] = []
    for enrollment in (
        db.query(AbenetEnrollment)
        .options(selectinload(AbenetEnrollment.parent))
        .order_by(AbenetEnrollment.child_last_name.asc(), AbenetEnrollment.child_first_name.asc())
    ):
        parent = enrollment.parent
        rows.append(
            AbenetReportRow(
                child_name=f"{enrollment.child_first_name} {enrollment.child_last_name}".strip(),
                parent_name=f"{parent.first_name} {parent.last_name}".strip(),
                service_stage=enrollment.service_stage,
                last_payment_at=enrollment.last_payment_at,
            )
        )
    return rows


def get_schools_meta() -> SchoolsMeta:
    return SchoolsMeta(
        monthly_amount=float(settings.ABENET_MONTHLY_AMOUNT),
        service_stages=["Alphabet", "Reading", "ForDeacons"],
        statuses=["Active", "Paused", "Completed", "Cancelled"],
        payment_methods=sorted(ALLOWED_CONTRIBUTION_METHODS),
    )
