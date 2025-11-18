from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from app.models.member import Member
from app.models.payment import Payment, PaymentServiceType
from app.models.schools import SundaySchoolEnrollment, SundaySchoolContent, SundaySchoolAuditLog
from app.models.user import User
from app.schemas.sunday_school import (
    ParticipantCreate,
    ParticipantUpdate,
    ParticipantOut,
    ParticipantList,
    ParticipantDetail,
    PaymentSummary,
    ContributionCreate,
    SundaySchoolStats,
    ContentCreate,
    ContentUpdate,
    ContentOut,
    ContentList,
    ContentApprovalRequest,
    ContentRejectionRequest,
    PublicContentOut,
    SundaySchoolReportRow,
    SundaySchoolMeta,
)
from app.services import payments as payment_service
from app.schemas.payment import PaymentCreate

SUNDAY_SCHOOL_SERVICE_CODE = "SCHOOLFEE"
ALLOWED_PAYMENT_METHODS = {"CASH", "DIRECT_DEPOSIT", "E_TRANSFER", "CREDIT"}


def _normalize_payment_method(method: str | None) -> str:
    if not method:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select a payment method before recording payment.")
    normalized = method.upper()
    if normalized not in ALLOWED_PAYMENT_METHODS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported Sunday School payment method.")
    return normalized


def _get_service_type(db: Session) -> PaymentServiceType:
    service = (
        db.query(PaymentServiceType)
        .filter(PaymentServiceType.code == SUNDAY_SCHOOL_SERVICE_CODE)
        .first()
    )
    if not service:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sunday School service type not configured.")
    return service


def _get_member(db: Session, username: str) -> Member:
    member = db.query(Member).filter(func.lower(Member.username) == username.lower()).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found.")
    return member


def _log_audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: int,
    actor: User | None,
    action: str,
    detail: str | None = None,
    changes: dict | None = None,
) -> None:
    entry = SundaySchoolAuditLog(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        detail=detail,
        changes=changes or None,
        actor_id=actor.id if actor else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)


def _snapshot(model, fields: Iterable[str]) -> dict:
    return {field: getattr(model, field) for field in fields}


def _normalize_value(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def _diff(before: dict, after: dict) -> dict:
    changes: dict[str, dict[str, object]] = {}
    for field, old_value in before.items():
        new_value = after.get(field)
        if old_value != new_value:
            changes[field] = {"old": _normalize_value(old_value), "new": _normalize_value(new_value)}
    return changes


def _serialize_participant(record: SundaySchoolEnrollment) -> ParticipantOut:
    return ParticipantOut.from_orm(record)


def _recent_payments(db: Session, member_id: int, limit: int = 5) -> list[PaymentSummary]:
    service = _get_service_type(db)
    rows = (
        db.query(Payment)
        .filter(
            Payment.member_id == member_id,
            Payment.service_type_id == service.id,
        )
        .order_by(Payment.posted_at.desc())
        .limit(limit)
        .all()
    )
    return [
        PaymentSummary(
            id=row.id,
            amount=float(row.amount),
            method=row.method,
            memo=row.memo,
            posted_at=row.posted_at,
            status=row.status,
        )
        for row in rows
    ]


def _refresh_last_payment(db: Session, record: SundaySchoolEnrollment) -> None:
    service = _get_service_type(db)
    latest = (
        db.query(Payment.posted_at)
        .filter(Payment.member_id == record.member_id, Payment.service_type_id == service.id)
        .order_by(Payment.posted_at.desc())
        .first()
    )
    record.last_payment_at = latest[0] if latest else None


def get_meta() -> SundaySchoolMeta:
    return SundaySchoolMeta(
        categories=["Child", "Youth", "Adult"],
        payment_methods=sorted(ALLOWED_PAYMENT_METHODS),
        content_types=["Mezmur", "Lesson", "Art"],
        content_statuses=["Draft", "Pending", "Approved", "Rejected"],
    )


def list_participants(
    db: Session,
    *,
    page: int,
    page_size: int,
    category: str | None = None,
    pays_contribution: bool | None = None,
    membership_from: date | None = None,
    membership_to: date | None = None,
    last_payment_from: date | None = None,
    last_payment_to: date | None = None,
    search: str | None = None,
) -> ParticipantList:
    query = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.is_active.is_(True))
    if category:
        query = query.filter(SundaySchoolEnrollment.category == category)
    if pays_contribution is True:
        query = query.filter(SundaySchoolEnrollment.pays_contribution.is_(True))
    elif pays_contribution is False:
        query = query.filter(SundaySchoolEnrollment.pays_contribution.is_(False))
    if membership_from:
        query = query.filter(SundaySchoolEnrollment.membership_date >= membership_from)
    if membership_to:
        query = query.filter(SundaySchoolEnrollment.membership_date <= membership_to)
    if last_payment_from:
        query = query.filter(SundaySchoolEnrollment.last_payment_at >= datetime.combine(last_payment_from, datetime.min.time(), tzinfo=timezone.utc))
    if last_payment_to:
        query = query.filter(SundaySchoolEnrollment.last_payment_at <= datetime.combine(last_payment_to, datetime.max.time(), tzinfo=timezone.utc))
    if search:
        keyword = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(SundaySchoolEnrollment.first_name).like(keyword),
                func.lower(SundaySchoolEnrollment.last_name).like(keyword),
                func.lower(SundaySchoolEnrollment.member_username).like(keyword),
                func.lower(SundaySchoolEnrollment.email).like(keyword),
                func.lower(SundaySchoolEnrollment.phone).like(keyword),
            )
        )
    total = query.count()
    rows = (
        query.order_by(SundaySchoolEnrollment.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [_serialize_participant(row) for row in rows]
    return ParticipantList(items=items, total=total, page=page, page_size=page_size)


def _apply_participant_updates(db: Session, record: SundaySchoolEnrollment, payload: ParticipantUpdate, actor: User | None) -> dict:
    before = _snapshot(
        record,
        [
            "member_username",
            "first_name",
            "last_name",
            "gender",
            "date_of_birth",
            "category",
            "membership_date",
            "phone",
            "email",
            "pays_contribution",
            "monthly_amount",
            "payment_method",
            "is_active",
        ],
    )
    if payload.member_username:
        member = _get_member(db, payload.member_username)
        record.member_id = member.id
        record.member_username = member.username
    for field in (
        "first_name",
        "last_name",
        "gender",
        "dob",
        "category",
        "membership_date",
        "phone",
        "email",
        "pays_contribution",
        "monthly_amount",
        "payment_method",
        "is_active",
    ):
        value = getattr(payload, field, None)
        if value is not None:
            if field == "dob":
                record.date_of_birth = value
            elif field == "payment_method" and value:
                setattr(record, field, value.upper())
            else:
                setattr(record, field, value)
    if payload.pays_contribution is False:
        record.monthly_amount = None
        record.payment_method = None
    record.updated_by_id = actor.id if actor else None
    return _diff(before, _snapshot(record, before.keys()))


def create_participant(db: Session, payload: ParticipantCreate, actor: User) -> ParticipantOut:
    member = _get_member(db, payload.member_username)
    record = SundaySchoolEnrollment(
        member_id=member.id,
        member_username=member.username,
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        gender=payload.gender,
        date_of_birth=payload.dob,
        category=payload.category,
        membership_date=payload.membership_date,
        phone=payload.phone,
        email=payload.email,
        pays_contribution=payload.pays_contribution,
        monthly_amount=payload.monthly_amount,
        payment_method=payload.payment_method.upper() if payload.payment_method else None,
        created_by_id=actor.id,
        updated_by_id=actor.id,
        is_active=True,
    )
    db.add(record)
    db.flush()
    _log_audit(
        db,
        entity_type="Participant",
        entity_id=record.id,
        actor=actor,
        action="Created participant",
        detail=f"{record.first_name} {record.last_name}",
    )
    db.commit()
    db.refresh(record)
    return _serialize_participant(record)


def update_participant(db: Session, participant_id: int, payload: ParticipantUpdate, actor: User) -> ParticipantOut:
    record = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.id == participant_id, SundaySchoolEnrollment.is_active.is_(True)).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found.")
    changes = _apply_participant_updates(db, record, payload, actor)
    db.commit()
    db.refresh(record)
    if changes:
        _log_audit(
            db,
            entity_type="Participant",
            entity_id=record.id,
            actor=actor,
            action="Updated participant",
            changes=changes,
        )
        db.commit()
    return _serialize_participant(record)


def get_participant(db: Session, participant_id: int) -> ParticipantDetail:
    record = (
        db.query(SundaySchoolEnrollment)
        .options(selectinload(SundaySchoolEnrollment.member))
        .filter(SundaySchoolEnrollment.id == participant_id, SundaySchoolEnrollment.is_active.is_(True))
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found.")
    _refresh_last_payment(db, record)
    db.commit()
    payments = _recent_payments(db, record.member_id)
    participant = _serialize_participant(record)
    return ParticipantDetail(**participant.dict(), recent_payments=payments)


def deactivate_participant(db: Session, participant_id: int, actor: User) -> ParticipantOut:
    record = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.id == participant_id, SundaySchoolEnrollment.is_active.is_(True)).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found.")
    record.is_active = False
    record.updated_by_id = actor.id
    db.commit()
    _log_audit(
        db,
        entity_type="Participant",
        entity_id=record.id,
        actor=actor,
        action="Marked inactive",
    )
    db.commit()
    db.refresh(record)
    return _serialize_participant(record)


def record_contribution(db: Session, participant_id: int, payload: ContributionCreate, actor: User) -> ParticipantOut:
    record = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.id == participant_id, SundaySchoolEnrollment.is_active.is_(True)).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found.")
    method = _normalize_payment_method(payload.method)
    amount_decimal = Decimal(str(payload.amount)) if payload.amount is not None else Decimal(str(record.monthly_amount or 0))
    if amount_decimal <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enter a positive contribution amount.")
    payment_payload = PaymentCreate(
        amount=float(amount_decimal),
        currency="CAD",
        method=method,
        memo=payload.memo or f"Sunday School contribution for {record.first_name} {record.last_name}",
        service_type_code=SUNDAY_SCHOOL_SERVICE_CODE,
        member_id=record.member_id,
        status="Completed",
        due_date=date.today(),
    )
    payment = payment_service.record_payment(db, payment_payload, actor, auto_commit=False)
    record.last_payment_at = payment.posted_at
    record.pays_contribution = True
    record.payment_method = method
    record.monthly_amount = amount_decimal
    record.updated_by_id = actor.id
    _log_audit(
        db,
        entity_type="Participant",
        entity_id=record.id,
        actor=actor,
        action="Recorded contribution",
        detail=f"{float(amount_decimal):.2f} via {method}",
    )
    db.commit()
    db.refresh(record)
    return _serialize_participant(record)


def participants_stats(db: Session) -> SundaySchoolStats:
    base_query = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.is_active.is_(True))
    total = base_query.count()
    child_count = base_query.filter(SundaySchoolEnrollment.category == "Child").count()
    youth_count = base_query.filter(SundaySchoolEnrollment.category == "Youth").count()
    adult_count = base_query.filter(SundaySchoolEnrollment.category == "Adult").count()
    paying = base_query.filter(SundaySchoolEnrollment.pays_contribution.is_(True)).count()
    non_paying = total - paying

    service = _get_service_type(db)
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    revenue_last_30 = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.service_type_id == service.id, Payment.posted_at >= cutoff)
        .scalar()
        or 0
    )

    pending_counts = dict.fromkeys(["Mezmur", "Lesson", "Art"], 0)
    rows = (
        db.query(SundaySchoolContent.type, func.count(SundaySchoolContent.id))
        .filter(SundaySchoolContent.status == "Pending")
        .group_by(SundaySchoolContent.type)
        .all()
    )
    for content_type, count in rows:
        pending_counts[content_type] = count

    return SundaySchoolStats(
        total_participants=total,
        count_child=child_count,
        count_youth=youth_count,
        count_adult=adult_count,
        count_paying_contribution=paying,
        count_not_paying_contribution=non_paying,
        revenue_last_30_days=float(revenue_last_30),
        pending_mezmur=pending_counts.get("Mezmur", 0) or 0,
        pending_lessons=pending_counts.get("Lesson", 0) or 0,
        pending_art=pending_counts.get("Art", 0) or 0,
    )


def list_content(
    db: Session,
    *,
    content_type: str | None = None,
    status_filter: str | None = None,
    search: str | None = None,
) -> ContentList:
    query = (
        db.query(SundaySchoolContent)
        .options(selectinload(SundaySchoolContent.participant))
        .order_by(SundaySchoolContent.updated_at.desc())
    )
    if content_type:
        query = query.filter(SundaySchoolContent.type == content_type)
    if status_filter:
        query = query.filter(SundaySchoolContent.status == status_filter)
    if search:
        keyword = f"%{search.lower()}%"
        query = query.filter(func.lower(SundaySchoolContent.title).like(keyword))
    rows = query.all()
    return ContentList(items=[ContentOut.from_orm(row) for row in rows], total=len(rows))


def create_content(db: Session, payload: ContentCreate, actor: User) -> ContentOut:
    content = SundaySchoolContent(
        type=payload.type,
        title=payload.title,
        body=payload.body,
        file_path=payload.file_path,
        participant_id=payload.participant_id,
        status="Draft",
        published=False,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(content)
    db.flush()
    _log_audit(
        db,
        entity_type="Content",
        entity_id=content.id,
        actor=actor,
        action="Created content",
        detail=f"{content.type} · {content.title}",
    )
    db.commit()
    db.refresh(content)
    return ContentOut.from_orm(content)


def update_content(db: Session, content_id: int, payload: ContentUpdate, actor: User) -> ContentOut:
    content = db.query(SundaySchoolContent).filter(SundaySchoolContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found.")
    editable_states = {"Draft", "Rejected"}
    if content.status not in editable_states and payload.published is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft or rejected content can be updated.")
    before = _snapshot(content, ["title", "body", "file_path", "participant_id", "published"])
    if payload.title is not None:
        content.title = payload.title
    if payload.body is not None:
        content.body = payload.body
    if payload.file_path is not None:
        content.file_path = payload.file_path
    if payload.participant_id is not None:
        content.participant_id = payload.participant_id
    if payload.published is not None and content.status == "Approved":
        content.published = payload.published
    content.updated_by_id = actor.id
    changes = _diff(before, _snapshot(content, before.keys()))
    db.commit()
    db.refresh(content)
    if changes:
        _log_audit(
            db,
            entity_type="Content",
            entity_id=content.id,
            actor=actor,
            action="Updated content",
            changes=changes,
        )
        db.commit()
    return ContentOut.from_orm(content)


def submit_content(db: Session, content_id: int, actor: User) -> ContentOut:
    content = db.query(SundaySchoolContent).filter(SundaySchoolContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found.")
    if content.status not in {"Draft", "Rejected"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft or rejected content can be submitted.")
    content.status = "Pending"
    content.rejection_reason = None
    content.updated_by_id = actor.id
    _log_audit(
        db,
        entity_type="Content",
        entity_id=content.id,
        actor=actor,
        action="Submitted for approval",
    )
    db.commit()
    db.refresh(content)
    return ContentOut.from_orm(content)


def approve_content(db: Session, content_id: int, actor: User, request: ContentApprovalRequest) -> ContentOut:
    content = db.query(SundaySchoolContent).filter(SundaySchoolContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found.")
    if content.status != "Pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending content can be approved.")
    content.status = "Approved"
    content.rejection_reason = None
    content.approved_by_id = actor.id
    content.approved_at = datetime.now(timezone.utc)
    content.published = request.publish_immediately
    _log_audit(
        db,
        entity_type="Content",
        entity_id=content.id,
        actor=actor,
        action="Approved content",
    )
    db.commit()
    db.refresh(content)
    return ContentOut.from_orm(content)


def reject_content(db: Session, content_id: int, actor: User, request: ContentRejectionRequest) -> ContentOut:
    content = db.query(SundaySchoolContent).filter(SundaySchoolContent.id == content_id).first()
    if not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Content not found.")
    if content.status != "Pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only pending content can be rejected.")
    content.status = "Rejected"
    content.rejection_reason = request.reason
    content.published = False
    content.approved_by_id = None
    content.approved_at = None
    _log_audit(
        db,
        entity_type="Content",
        entity_id=content.id,
        actor=actor,
        action="Rejected content",
        detail=request.reason,
    )
    db.commit()
    db.refresh(content)
    return ContentOut.from_orm(content)


def list_public_content(db: Session, *, content_type: str) -> list[PublicContentOut]:
    rows = (
        db.query(SundaySchoolContent)
        .options(selectinload(SundaySchoolContent.participant))
        .filter(
            SundaySchoolContent.type == content_type,
            SundaySchoolContent.status == "Approved",
            SundaySchoolContent.published.is_(True),
        )
        .order_by(SundaySchoolContent.updated_at.desc())
        .all()
    )
    public_items: list[PublicContentOut] = []
    for row in rows:
        participant_name = None
        if row.participant:
            participant_name = f"{row.participant.first_name} {row.participant.last_name}".strip()
        public_items.append(
            PublicContentOut(
                id=row.id,
                title=row.title,
                type=row.type,
                body=row.body,
                file_path=row.file_path,
                participant_name=participant_name or None,
                published_at=row.approved_at or row.updated_at,
            )
        )
    return public_items


def sunday_school_report(db: Session, *, start: date | None = None, end: date | None = None) -> list[SundaySchoolReportRow]:
    query = db.query(SundaySchoolEnrollment).filter(SundaySchoolEnrollment.is_active.is_(True))
    if start:
        query = query.filter(or_(SundaySchoolEnrollment.last_payment_at.is_(None), SundaySchoolEnrollment.last_payment_at >= datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc)))
    if end:
        query = query.filter(SundaySchoolEnrollment.last_payment_at <= datetime.combine(end, datetime.max.time(), tzinfo=timezone.utc))
    rows = query.order_by(SundaySchoolEnrollment.last_name.asc(), SundaySchoolEnrollment.first_name.asc()).all()
    return [
        SundaySchoolReportRow(
            first_name=row.first_name,
            last_name=row.last_name,
            category=row.category,
            last_payment_at=row.last_payment_at,
        )
        for row in rows
    ]
