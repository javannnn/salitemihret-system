from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
import json
from typing import get_args

from fastapi import HTTPException, status
from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session, joinedload

from app.models.member import Member
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.newcomer import Newcomer
from app.models.newcomer_tracking import NewcomerStatusAudit
from app.models.priest import Priest
from app.models.sponsorship import Sponsorship
from app.models.sponsorship_audit import SponsorshipStatusAudit
from app.models.sponsorship_budget_round import SponsorshipBudgetRound
from app.models.sponsorship_note import SponsorshipNote
from app.models.user import User
from app.schemas.member import ContributionPaymentOut
from app.schemas.sponsorship import (
    MemberSummary,
    NewcomerSummary,
    SponsorshipBudgetRoundCreate,
    SponsorshipBudgetRoundOut,
    SponsorshipBudgetRoundUpdate,
    SponsorshipBudgetRoundSummary,
    SponsorshipDecision,
    SponsorshipMetrics,
    SponsorshipMotivation,
    SponsorshipNoteCreate,
    SponsorshipNoteOut,
    SponsorshipNotesListResponse,
    SponsorshipNotesTemplate,
    SponsorshipSponsorContext,
    SponsorshipCreate,
    SponsorshipListResponse,
    SponsorshipOut,
    SponsorshipPledgeChannel,
    SponsorshipProgram,
    SponsorshipReminderChannel,
    SponsorshipStatus,
    SponsorshipStatusTransitionRequest,
    SponsorshipTimelineEvent,
    SponsorshipTimelineResponse,
    SponsorshipUpdate,
)
from app.services.notifications import send_sponsorship_reminder

ALLOWED_SPONSOR_STATUSES = {"Active"}
VALID_SPONSORSHIP_STATUSES = set(get_args(SponsorshipStatus))
VALID_DECISIONS = set(get_args(SponsorshipDecision))
VALID_PROGRAMS = set(get_args(SponsorshipProgram))
VALID_PLEDGE_CHANNELS = set(get_args(SponsorshipPledgeChannel))
VALID_REMINDER_CHANNELS = set(get_args(SponsorshipReminderChannel))
VALID_MOTIVATIONS = set(get_args(SponsorshipMotivation))
VALID_NOTES_TEMPLATES = set(get_args(SponsorshipNotesTemplate))


def _coerce_literal(value: str | None) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        value = value.value  # type: ignore[assignment]
    return str(value)


def _sanitize_literal(value: str | None, allowed: set[str]) -> str | None:
    coerced = _coerce_literal(value)
    if coerced in allowed:
        return coerced
    return None


def _normalize_status(value: str | None) -> str:
    coerced = _coerce_literal(value)
    if coerced in VALID_SPONSORSHIP_STATUSES:
        return coerced
    return "Draft"


def _member_summary(member: Member | None) -> MemberSummary | None:
    if not member:
        return None
    return MemberSummary.from_orm(member)


def _newcomer_summary(newcomer: Newcomer | None) -> NewcomerSummary | None:
    if not newcomer:
        return None
    return NewcomerSummary.from_orm(newcomer)


def _actor_name(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.username or user.email


def _parse_volunteer_services(raw: str | list[str] | None, fallback: str | None = None) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    if raw:
        try:
            data = json.loads(raw)
            if isinstance(data, list):
                return [str(item).strip() for item in data if str(item).strip()]
        except json.JSONDecodeError:
            pass
        return [item.strip() for item in raw.split(",") if item.strip()]
    if fallback:
        return [fallback]
    return []


def _dump_volunteer_services(services: list[str] | None) -> str | None:
    if not services:
        return None
    cleaned = [service.strip() for service in services if service.strip()]
    if not cleaned:
        return None
    return json.dumps(cleaned)


def _validate_member(db: Session, member_id: int) -> Member:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if member.status not in ALLOWED_SPONSOR_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sponsor must be an active member")
    return member


def _load_member(db: Session, member_id: int) -> Member:
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Beneficiary member not found")
    return member


def _load_newcomer(db: Session, newcomer_id: int) -> Newcomer:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    return newcomer


def _load_priest(db: Session, priest_id: int) -> Priest:
    priest = db.query(Priest).filter(Priest.id == priest_id).first()
    if not priest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Priest not found")
    return priest


def _load_budget_round(db: Session, round_id: int) -> SponsorshipBudgetRound:
    budget_round = db.query(SponsorshipBudgetRound).filter(SponsorshipBudgetRound.id == round_id).first()
    if not budget_round:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget round not found")
    return budget_round


def _normalize_beneficiary_name(
    *,
    beneficiary_name: str | None,
    beneficiary_member: Member | None,
    newcomer: Newcomer | None,
) -> str:
    if beneficiary_member:
        return f"{beneficiary_member.first_name} {beneficiary_member.last_name}".strip()
    if newcomer:
        return newcomer.full_name
    if beneficiary_name and beneficiary_name.strip():
        return beneficiary_name.strip()
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a beneficiary name or link to a record")


def _is_admin(user: User | None) -> bool:
    if not user:
        return False
    if user.is_super_admin:
        return True
    return any(role.name == "Admin" for role in user.roles)


def _log_status_audit(
    db: Session,
    *,
    sponsorship: Sponsorship,
    from_status: str | None,
    to_status: str | None,
    reason: str | None,
    actor_id: int | None,
    action: str,
) -> None:
    audit = SponsorshipStatusAudit(
        sponsorship_id=sponsorship.id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        changed_by_id=actor_id,
    )
    db.add(audit)


def _log_newcomer_link(
    db: Session,
    *,
    newcomer: Newcomer,
    action: str,
    reason: str | None,
    actor_id: int | None,
) -> None:
    db.add(
        NewcomerStatusAudit(
            newcomer_id=newcomer.id,
            action=action,
            from_status=newcomer.status,
            to_status=newcomer.status,
            reason=reason,
            changed_by_id=actor_id,
        )
    )


def _serialize(db: Session, sponsorship: Sponsorship) -> SponsorshipOut:
    received_amount = Decimal(sponsorship.received_amount or 0).quantize(Decimal("0.01"))

    status = _normalize_status(sponsorship.status)
    last_status = _sanitize_literal(sponsorship.last_status, VALID_DECISIONS)
    program = _sanitize_literal(sponsorship.program, VALID_PROGRAMS)
    pledge_channel = _sanitize_literal(sponsorship.pledge_channel, VALID_PLEDGE_CHANNELS)
    reminder_channel = _sanitize_literal(sponsorship.reminder_channel, VALID_REMINDER_CHANNELS)
    motivation = _sanitize_literal(sponsorship.motivation, VALID_MOTIVATIONS)
    notes_template = _sanitize_literal(sponsorship.notes_template, VALID_NOTES_TEMPLATES)

    volunteer_services = _parse_volunteer_services(sponsorship.volunteer_services, sponsorship.volunteer_service)
    if not volunteer_services:
        volunteer_services = []
    budget_utilization_percent = None
    budget_over_capacity = False
    if sponsorship.budget_slots and sponsorship.budget_slots > 0:
        percent = (sponsorship.used_slots or 0) / sponsorship.budget_slots
        budget_utilization_percent = round(percent * 100, 2)
        budget_over_capacity = (sponsorship.used_slots or 0) > sponsorship.budget_slots

    days_since_last = None
    if sponsorship.last_sponsored_date:
        days_since_last = (date.today() - sponsorship.last_sponsored_date).days

    father_name = None
    if sponsorship.father_of_repentance:
        father_name = sponsorship.father_of_repentance.full_name

    return SponsorshipOut(
        id=sponsorship.id,
        sponsor=_member_summary(sponsorship.sponsor),
        beneficiary_member=_member_summary(sponsorship.beneficiary_member),
        newcomer=_newcomer_summary(sponsorship.newcomer),
        beneficiary_name=sponsorship.beneficiary_name,
        father_of_repentance_id=sponsorship.father_of_repentance_id,
        volunteer_services=volunteer_services,
        volunteer_service_other=sponsorship.volunteer_service_other,
        payment_information=sponsorship.payment_information,
        last_sponsored_date=sponsorship.last_sponsored_date,
        days_since_last_sponsorship=days_since_last,
        frequency=sponsorship.frequency,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        monthly_amount=Decimal(sponsorship.monthly_amount or 0).quantize(Decimal("0.01")),
        received_amount=received_amount,
        program=program,  # type: ignore[arg-type]
        pledge_channel=pledge_channel,  # type: ignore[arg-type]
        reminder_channel=reminder_channel,  # type: ignore[arg-type]
        motivation=motivation,  # type: ignore[arg-type]
        start_date=sponsorship.start_date,
        end_date=sponsorship.end_date,
        last_status=last_status,  # type: ignore[arg-type]
        last_status_reason=sponsorship.last_status_reason,
        budget_month=sponsorship.budget_month,
        budget_year=sponsorship.budget_year,
        budget_round_id=sponsorship.budget_round_id,
        budget_slots=sponsorship.budget_slots,
        budget_round=SponsorshipBudgetRoundSummary.from_orm(sponsorship.budget_round)
        if sponsorship.budget_round
        else None,
        used_slots=sponsorship.used_slots or 0,
        budget_utilization_percent=budget_utilization_percent,
        budget_over_capacity=budget_over_capacity,
        notes=sponsorship.notes,
        notes_template=notes_template,  # type: ignore[arg-type]
        reminder_last_sent=sponsorship.reminder_last_sent,
        reminder_next_due=sponsorship.reminder_next_due,
        assigned_staff_id=sponsorship.assigned_staff_id,
        submitted_at=sponsorship.submitted_at,
        submitted_by_id=sponsorship.submitted_by_id,
        approved_at=sponsorship.approved_at,
        approved_by_id=sponsorship.approved_by_id,
        rejected_at=sponsorship.rejected_at,
        rejected_by_id=sponsorship.rejected_by_id,
        rejection_reason=sponsorship.rejection_reason,
        sponsor_status=sponsorship.sponsor.status if sponsorship.sponsor else None,
        father_of_repentance_name=father_name,
        created_at=sponsorship.created_at,
        updated_at=sponsorship.updated_at,
    )


def list_sponsorships(
    db: Session,
    *,
    page: int,
    page_size: int,
    status_filter: str | None = None,
    program: str | None = None,
    sponsor_id: int | None = None,
    newcomer_id: int | None = None,
    frequency: str | None = None,
    beneficiary_type: str | None = None,
    county: str | None = None,
    assigned_staff_id: int | None = None,
    budget_month: int | None = None,
    budget_year: int | None = None,
    budget_round_id: int | None = None,
    search: str | None = None,
    has_newcomer: bool | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
) -> SponsorshipListResponse:
    query = (
        db.query(Sponsorship)
        .options(
            joinedload(Sponsorship.sponsor),
            joinedload(Sponsorship.beneficiary_member),
            joinedload(Sponsorship.newcomer),
            joinedload(Sponsorship.father_of_repentance),
            joinedload(Sponsorship.budget_round),
        )
        .order_by(Sponsorship.updated_at.desc())
    )

    if status_filter:
        query = query.filter(cast(Sponsorship.status, String) == status_filter)
    if program:
        query = query.filter(Sponsorship.program == program)
    if sponsor_id:
        query = query.filter(Sponsorship.sponsor_member_id == sponsor_id)
    if newcomer_id:
        query = query.filter(Sponsorship.newcomer_id == newcomer_id)
    if frequency:
        query = query.filter(Sponsorship.frequency == frequency)
    if beneficiary_type:
        normalized = beneficiary_type.strip().lower()
        if normalized == "newcomer":
            query = query.filter(Sponsorship.newcomer_id.isnot(None))
        elif normalized == "member":
            query = query.filter(Sponsorship.beneficiary_member_id.isnot(None))
        elif normalized == "external":
            query = query.filter(
                Sponsorship.newcomer_id.is_(None),
                Sponsorship.beneficiary_member_id.is_(None),
            )
    if assigned_staff_id is not None:
        query = query.filter(Sponsorship.assigned_staff_id == assigned_staff_id)
    if budget_month is not None:
        query = query.filter(Sponsorship.budget_month == budget_month)
    if budget_year is not None:
        query = query.filter(Sponsorship.budget_year == budget_year)
    if budget_round_id is not None:
        query = query.filter(Sponsorship.budget_round_id == budget_round_id)
    if has_newcomer is not None:
        if has_newcomer:
            query = query.filter(Sponsorship.newcomer_id.isnot(None))
        else:
            query = query.filter(Sponsorship.newcomer_id.is_(None))
    if start_date:
        query = query.filter(Sponsorship.start_date >= start_date)
    if end_date:
        query = query.filter(Sponsorship.start_date <= end_date)
    if created_from:
        query = query.filter(func.date(Sponsorship.created_at) >= created_from)
    if created_to:
        query = query.filter(func.date(Sponsorship.created_at) <= created_to)
    if county:
        like = f"%{county.strip().lower()}%"
        query = query.join(Sponsorship.newcomer).filter(
            func.lower(func.coalesce(Newcomer.county, "")).like(like)
        )
    if search:
        like = f"%{search.lower()}%"
        query = query.join(Sponsorship.sponsor).outerjoin(Sponsorship.newcomer).filter(
            func.lower(Member.first_name).like(like)
            | func.lower(Member.last_name).like(like)
            | func.lower(Sponsorship.beneficiary_name).like(like)
            | func.lower(func.coalesce(Newcomer.first_name, "")).like(like)
            | func.lower(func.coalesce(Newcomer.last_name, "")).like(like)
        )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return SponsorshipListResponse(
        items=[_serialize(db, item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def _ensure_no_conflict(
    db: Session,
    *,
    beneficiary_member_id: int | None,
    newcomer_id: int | None,
    beneficiary_name: str | None,
    exclude_id: int | None = None,
) -> None:
    inactive_statuses = {"Rejected", "Completed", "Closed"}
    query = db.query(Sponsorship).filter(~cast(Sponsorship.status, String).in_(inactive_statuses))
    if exclude_id:
        query = query.filter(Sponsorship.id != exclude_id)
    if beneficiary_member_id:
        query = query.filter(Sponsorship.beneficiary_member_id == beneficiary_member_id)
    elif newcomer_id:
        query = query.filter(Sponsorship.newcomer_id == newcomer_id)
    elif beneficiary_name:
        query = query.filter(func.lower(Sponsorship.beneficiary_name) == beneficiary_name.strip().lower())
    else:
        return
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Beneficiary already has an active sponsorship.",
        )


def create_sponsorship(db: Session, payload: SponsorshipCreate, actor_id: int | None) -> SponsorshipOut:
    sponsor = _validate_member(db, payload.sponsor_member_id)
    beneficiary_member = None
    if payload.beneficiary_member_id:
        beneficiary_member = _load_member(db, payload.beneficiary_member_id)

    newcomer = None
    if payload.newcomer_id:
        newcomer = _load_newcomer(db, payload.newcomer_id)
        if newcomer.status == "Closed":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer is already closed")

    if payload.father_of_repentance_id:
        _load_priest(db, payload.father_of_repentance_id)

    budget_round_id = None
    if payload.budget_round_id is not None:
        if payload.budget_round_id > 0:
            budget_round_id = _load_budget_round(db, payload.budget_round_id).id
        else:
            budget_round_id = None

    beneficiary_name = _normalize_beneficiary_name(
        beneficiary_name=payload.beneficiary_name,
        beneficiary_member=beneficiary_member,
        newcomer=newcomer,
    )

    _ensure_no_conflict(
        db,
        beneficiary_member_id=beneficiary_member.id if beneficiary_member else None,
        newcomer_id=newcomer.id if newcomer else None,
        beneficiary_name=beneficiary_name,
    )

    father_id = payload.father_of_repentance_id
    if father_id is None and getattr(sponsor, "father_confessor_id", None):
        father_id = sponsor.father_confessor_id

    volunteer_services_raw = _dump_volunteer_services(payload.volunteer_services)
    legacy_service_value = None
    if volunteer_services_raw:
        try:
            parsed = json.loads(volunteer_services_raw)
            legacy_service_value = parsed[0] if parsed else None
        except json.JSONDecodeError:
            pass
    elif payload.volunteer_service_other:
        legacy_service_value = payload.volunteer_service_other

    if payload.status not in ("Draft", "Submitted"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New sponsorships must start as Draft or Submitted")

    submitted_at = None
    submitted_by_id = None
    if payload.status == "Submitted":
        submitted_at = datetime.utcnow()
        submitted_by_id = actor_id

    sponsorship = Sponsorship(
        sponsor_member_id=sponsor.id,
        beneficiary_member_id=beneficiary_member.id if beneficiary_member else None,
        newcomer_id=newcomer.id if newcomer else None,
        beneficiary_name=beneficiary_name,
        father_of_repentance_id=father_id,
        volunteer_service=legacy_service_value,
        volunteer_services=volunteer_services_raw,
        volunteer_service_other=payload.volunteer_service_other,
        payment_information=payload.payment_information,
        last_sponsored_date=payload.last_sponsored_date,
        frequency=payload.frequency.strip() if payload.frequency else "Monthly",
        last_status=payload.last_status,
        last_status_reason=payload.last_status_reason,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        monthly_amount=Decimal(payload.monthly_amount).quantize(Decimal("0.01")),
        received_amount=Decimal(payload.received_amount or 0).quantize(Decimal("0.01")),
        program=payload.program,
        pledge_channel=payload.pledge_channel,
        reminder_channel=payload.reminder_channel,
        motivation=payload.motivation,
        budget_month=payload.budget_month,
        budget_year=payload.budget_year,
        budget_round_id=budget_round_id,
        budget_slots=payload.budget_slots,
        used_slots=0,
        notes=payload.notes,
        notes_template=payload.notes_template,
        assigned_staff_id=payload.assigned_staff_id,
        submitted_at=submitted_at,
        submitted_by_id=submitted_by_id,
        created_by_id=actor_id,
        updated_by_id=actor_id,
    )
    db.add(sponsorship)
    db.flush()
    _log_status_audit(
        db,
        sponsorship=sponsorship,
        from_status=None,
        to_status=payload.status,
        reason=None,
        actor_id=actor_id,
        action="StatusChange",
    )
    if newcomer:
        _log_newcomer_link(
            db,
            newcomer=newcomer,
            action="SponsorshipLink",
            reason=f"Linked to sponsorship case #{sponsorship.id}",
            actor_id=actor_id,
        )

    db.commit()
    db.refresh(sponsorship)
    return _serialize(db, sponsorship)


def _load_sponsorship(db: Session, sponsorship_id: int) -> Sponsorship:
    sponsorship = (
        db.query(Sponsorship)
        .options(
            joinedload(Sponsorship.sponsor),
            joinedload(Sponsorship.beneficiary_member),
            joinedload(Sponsorship.newcomer),
            joinedload(Sponsorship.budget_round),
        )
        .filter(Sponsorship.id == sponsorship_id)
        .first()
    )
    if not sponsorship:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsorship not found")
    return sponsorship


def get_sponsorship(db: Session, sponsorship_id: int) -> SponsorshipOut:
    record = _load_sponsorship(db, sponsorship_id)
    return _serialize(db, record)


def update_sponsorship(db: Session, sponsorship_id: int, payload: SponsorshipUpdate, actor_id: int | None) -> SponsorshipOut:
    sponsorship = _load_sponsorship(db, sponsorship_id)
    fields_set = payload.__fields_set__

    if payload.status is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update sponsorship status via the status endpoint")
    if payload.rejection_reason is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update rejection reason via the status endpoint")

    old_beneficiary_member = sponsorship.beneficiary_member
    old_newcomer = sponsorship.newcomer
    old_beneficiary_name = sponsorship.beneficiary_name
    old_label = _normalize_beneficiary_name(
        beneficiary_name=old_beneficiary_name,
        beneficiary_member=old_beneficiary_member,
        newcomer=old_newcomer,
    )

    beneficiary_member = None
    if payload.beneficiary_member_id is not None:
        beneficiary_member = _load_member(db, payload.beneficiary_member_id)
        sponsorship.beneficiary_member_id = beneficiary_member.id
    elif payload.beneficiary_member_id == 0:
        sponsorship.beneficiary_member_id = None
        beneficiary_member = None

    newcomer = sponsorship.newcomer
    if payload.newcomer_id is not None:
        newcomer = _load_newcomer(db, payload.newcomer_id)
        sponsorship.newcomer_id = newcomer.id
    elif payload.newcomer_id == 0:
        sponsorship.newcomer_id = None
        newcomer = None

    if payload.father_of_repentance_id is not None:
        if payload.father_of_repentance_id == 0:
            sponsorship.father_of_repentance_id = None
        else:
            _load_priest(db, payload.father_of_repentance_id)
            sponsorship.father_of_repentance_id = payload.father_of_repentance_id

    if beneficiary_member or newcomer or payload.beneficiary_name:
        sponsorship.beneficiary_name = _normalize_beneficiary_name(
            beneficiary_name=payload.beneficiary_name or sponsorship.beneficiary_name,
            beneficiary_member=beneficiary_member or sponsorship.beneficiary_member,
            newcomer=newcomer or sponsorship.newcomer,
        )

    if payload.frequency:
        sponsorship.frequency = payload.frequency.strip()
    if payload.last_status is not None:
        sponsorship.last_status = payload.last_status
    if payload.last_status_reason is not None:
        sponsorship.last_status_reason = payload.last_status_reason
    if payload.start_date:
        sponsorship.start_date = payload.start_date
    if payload.end_date is not None:
        sponsorship.end_date = payload.end_date
    if payload.monthly_amount:
        sponsorship.monthly_amount = Decimal(payload.monthly_amount).quantize(Decimal("0.01"))
    if payload.received_amount is not None:
        sponsorship.received_amount = Decimal(payload.received_amount).quantize(Decimal("0.01"))
    if payload.program is not None:
        sponsorship.program = payload.program
    if payload.pledge_channel is not None:
        sponsorship.pledge_channel = payload.pledge_channel
    if payload.reminder_channel is not None:
        sponsorship.reminder_channel = payload.reminder_channel
    if payload.motivation is not None:
        sponsorship.motivation = payload.motivation
    if payload.budget_month is not None:
        sponsorship.budget_month = payload.budget_month
    if payload.budget_year is not None:
        sponsorship.budget_year = payload.budget_year
    if "budget_round_id" in fields_set:
        if payload.budget_round_id and payload.budget_round_id > 0:
            sponsorship.budget_round_id = _load_budget_round(db, payload.budget_round_id).id
        else:
            sponsorship.budget_round_id = None
    if payload.budget_slots is not None:
        sponsorship.budget_slots = payload.budget_slots
    if payload.notes is not None:
        sponsorship.notes = payload.notes
    if payload.notes_template is not None:
        sponsorship.notes_template = payload.notes_template
    if payload.used_slots is not None:
        if sponsorship.budget_slots is not None and payload.used_slots > sponsorship.budget_slots:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Used slots cannot exceed budget slots")
        sponsorship.used_slots = payload.used_slots
    if payload.volunteer_services is not None:
        stored = _dump_volunteer_services(payload.volunteer_services)
        sponsorship.volunteer_services = stored
        if payload.volunteer_services:
            sponsorship.volunteer_service = payload.volunteer_services[0]
        elif stored is None:
            sponsorship.volunteer_service = None
    if payload.volunteer_service_other is not None:
        sponsorship.volunteer_service_other = payload.volunteer_service_other
    if payload.payment_information is not None:
        sponsorship.payment_information = payload.payment_information
    if payload.last_sponsored_date is not None:
        sponsorship.last_sponsored_date = payload.last_sponsored_date
    if payload.assigned_staff_id is not None:
        sponsorship.assigned_staff_id = payload.assigned_staff_id or None

    _ensure_no_conflict(
        db,
        beneficiary_member_id=sponsorship.beneficiary_member_id,
        newcomer_id=sponsorship.newcomer_id,
        beneficiary_name=sponsorship.beneficiary_name,
        exclude_id=sponsorship.id,
    )

    new_label = _normalize_beneficiary_name(
        beneficiary_name=sponsorship.beneficiary_name,
        beneficiary_member=sponsorship.beneficiary_member,
        newcomer=sponsorship.newcomer,
    )
    if (
        sponsorship.beneficiary_member_id != getattr(old_beneficiary_member, "id", None)
        or sponsorship.newcomer_id != getattr(old_newcomer, "id", None)
        or old_label != new_label
    ):
        if old_label != new_label:
            reason = f"Beneficiary changed: {old_label} -> {new_label}"
        elif old_label and not new_label:
            reason = f"Beneficiary unlinked: {old_label}"
        else:
            reason = f"Beneficiary linked: {new_label}"
        _log_status_audit(
            db,
            sponsorship=sponsorship,
            from_status=None,
            to_status=None,
            reason=reason,
            actor_id=actor_id,
            action="BeneficiaryChange",
        )

    old_newcomer_id = getattr(old_newcomer, "id", None)
    new_newcomer_id = getattr(newcomer, "id", None) if "newcomer" in locals() else sponsorship.newcomer_id
    if old_newcomer_id != new_newcomer_id:
        if old_newcomer:
            _log_newcomer_link(
                db,
                newcomer=old_newcomer,
                action="SponsorshipUnlink",
                reason=f"Sponsorship case #{sponsorship.id} unlinked",
                actor_id=actor_id,
            )
        if newcomer:
            _log_newcomer_link(
                db,
                newcomer=newcomer,
                action="SponsorshipLink",
                reason=f"Linked to sponsorship case #{sponsorship.id}",
                actor_id=actor_id,
            )

    sponsorship.updated_by_id = actor_id
    db.commit()
    db.refresh(sponsorship)
    return _serialize(db, sponsorship)


REMINDER_INTERVALS = {
    "OneTime": 30,
    "Monthly": 30,
    "Quarterly": 90,
    "Yearly": 365,
}

STATUS_TRANSITIONS = {
    "Draft": {"Submitted"},
    "Submitted": {"Approved", "Rejected"},
    "Approved": {"Active"},
    "Rejected": set(),
    "Active": {"Suspended", "Completed"},
    "Suspended": {"Active", "Completed"},
    "Completed": set(),
    "Closed": set(),
}


def transition_sponsorship_status(
    db: Session,
    sponsorship_id: int,
    payload: SponsorshipStatusTransitionRequest,
    actor: User,
) -> SponsorshipOut:
    sponsorship = _load_sponsorship(db, sponsorship_id)
    current = sponsorship.status
    target = payload.status
    if current == target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sponsorship already in this status")

    allowed = STATUS_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid sponsorship status transition")

    if target in {"Approved", "Rejected"} and not _is_admin(actor):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin approval required for this transition")
    if target == "Rejected" and not (payload.reason and payload.reason.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rejection requires a reason")

    now = datetime.utcnow()
    action = "StatusChange"
    if target == "Submitted":
        sponsorship.submitted_at = now
        sponsorship.submitted_by_id = actor.id
    elif target == "Approved":
        sponsorship.approved_at = now
        sponsorship.approved_by_id = actor.id
        sponsorship.rejected_at = None
        sponsorship.rejected_by_id = None
        sponsorship.rejection_reason = None
        action = "Approval"
    elif target == "Rejected":
        sponsorship.rejected_at = now
        sponsorship.rejected_by_id = actor.id
        sponsorship.rejection_reason = payload.reason.strip()
        action = "Rejection"
    elif target == "Suspended":
        action = "Suspension"
    elif target == "Active" and current == "Suspended":
        action = "Reactivation"

    sponsorship.status = target
    sponsorship.updated_by_id = actor.id

    _log_status_audit(
        db,
        sponsorship=sponsorship,
        from_status=current,
        to_status=target,
        reason=payload.reason,
        actor_id=actor.id,
        action=action,
    )

    db.commit()
    db.refresh(sponsorship)
    return _serialize(db, sponsorship)


def trigger_reminder(db: Session, sponsorship_id: int) -> SponsorshipOut:
    sponsorship = _load_sponsorship(db, sponsorship_id)
    now = datetime.utcnow()
    interval_days = REMINDER_INTERVALS.get(sponsorship.frequency, 30)
    sponsorship.reminder_last_sent = now
    sponsorship.reminder_next_due = now + timedelta(days=interval_days)  # type: ignore[name-defined]
    db.commit()
    db.refresh(sponsorship)
    send_sponsorship_reminder(db, sponsorship)
    return _serialize(db, sponsorship)


def get_sponsorship_metrics(db: Session) -> SponsorshipMetrics:
    today = date.today()
    status_column = cast(Sponsorship.status, String)
    active_cases = (
        db.query(func.count(Sponsorship.id))
        .filter(status_column == "Active")
        .scalar()
        or 0
    )
    submitted_cases = (
        db.query(func.count(Sponsorship.id))
        .filter(status_column == "Submitted")
        .scalar()
        or 0
    )
    suspended_cases = (
        db.query(func.count(Sponsorship.id))
        .filter(status_column == "Suspended")
        .scalar()
        or 0
    )
    month_executed = (
        db.query(func.count(SponsorshipStatusAudit.id))
        .filter(SponsorshipStatusAudit.to_status == "Completed")
        .filter(func.extract("month", SponsorshipStatusAudit.changed_at) == today.month)
        .filter(func.extract("year", SponsorshipStatusAudit.changed_at) == today.year)
        .scalar()
        or 0
    )

    capacity_row = (
        db.query(
            func.coalesce(func.sum(Sponsorship.budget_slots), 0).label("total_slots"),
            func.coalesce(func.sum(Sponsorship.used_slots), 0).label("used_slots"),
        )
        .filter(Sponsorship.budget_month == today.month)
        .filter(Sponsorship.budget_year == today.year)
        .first()
    )
    current_budget = None
    alerts: list[str] = []
    percent_utilization = 0.0
    if capacity_row:
        total_slots = int(capacity_row.total_slots or 0)
        used_slots = int(capacity_row.used_slots or 0)
        if total_slots > 0:
            percent_utilization = round((used_slots / total_slots) * 100, 2)
        current_budget = {
            "month": today.month,
            "year": today.year,
            "total_slots": total_slots,
            "used_slots": used_slots,
            "utilization_percent": percent_utilization,
        }
        if total_slots > 0:
            if used_slots >= total_slots:
                alerts.append("Budget for this month is full.")
            elif percent_utilization >= 80:
                alerts.append(f"Budget is {percent_utilization}% utilized for this month.")

    return {
        "active_cases": active_cases,
        "submitted_cases": submitted_cases,
        "suspended_cases": suspended_cases,
        "month_executed": month_executed,
        "budget_utilization_percent": percent_utilization,
        "current_budget": current_budget,
        "alerts": alerts,
    }


def list_budget_rounds(db: Session, year: int | None = None) -> list[SponsorshipBudgetRoundOut]:
    query = db.query(SponsorshipBudgetRound)
    if year is not None:
        query = query.filter(SponsorshipBudgetRound.year == year)
    rounds = query.order_by(SponsorshipBudgetRound.year.desc(), SponsorshipBudgetRound.round_number.asc()).all()
    round_ids = [item.id for item in rounds]
    usage_rows: dict[int, dict[str, int]] = {}
    if round_ids:
        rows = (
            db.query(
                Sponsorship.budget_round_id,
                func.coalesce(func.sum(Sponsorship.budget_slots), 0).label("allocated_slots"),
                func.coalesce(func.sum(Sponsorship.used_slots), 0).label("used_slots"),
            )
            .filter(Sponsorship.budget_round_id.in_(round_ids))
            .group_by(Sponsorship.budget_round_id)
            .all()
        )
        usage_rows = {
            row.budget_round_id: {
                "allocated_slots": int(row.allocated_slots or 0),
                "used_slots": int(row.used_slots or 0),
            }
            for row in rows
        }

    items: list[SponsorshipBudgetRoundOut] = []
    for item in rounds:
        usage = usage_rows.get(item.id, {"allocated_slots": 0, "used_slots": 0})
        utilization = round((usage["used_slots"] / item.slot_budget) * 100, 2) if item.slot_budget else 0.0
        items.append(
            SponsorshipBudgetRoundOut(
                id=item.id,
                year=item.year,
                round_number=item.round_number,
                start_date=item.start_date,
                end_date=item.end_date,
                slot_budget=item.slot_budget,
                allocated_slots=usage["allocated_slots"],
                used_slots=usage["used_slots"],
                utilization_percent=utilization,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
        )
    return items


def create_budget_round(db: Session, payload: SponsorshipBudgetRoundCreate) -> SponsorshipBudgetRoundOut:
    existing = (
        db.query(SponsorshipBudgetRound)
        .filter(SponsorshipBudgetRound.year == payload.year)
        .filter(SponsorshipBudgetRound.round_number == payload.round_number)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Budget round already exists for this year")
    record = SponsorshipBudgetRound(
        year=payload.year,
        round_number=payload.round_number,
        start_date=payload.start_date,
        end_date=payload.end_date,
        slot_budget=payload.slot_budget,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return SponsorshipBudgetRoundOut(
        id=record.id,
        year=record.year,
        round_number=record.round_number,
        start_date=record.start_date,
        end_date=record.end_date,
        slot_budget=record.slot_budget,
        allocated_slots=0,
        used_slots=0,
        utilization_percent=0.0,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def update_budget_round(db: Session, round_id: int, payload: SponsorshipBudgetRoundUpdate) -> SponsorshipBudgetRoundOut:
    record = db.query(SponsorshipBudgetRound).filter(SponsorshipBudgetRound.id == round_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget round not found")

    fields_set = payload.__fields_set__
    next_year = payload.year if "year" in fields_set else record.year
    next_round = payload.round_number if "round_number" in fields_set else record.round_number
    if next_year != record.year or next_round != record.round_number:
        existing = (
            db.query(SponsorshipBudgetRound)
            .filter(SponsorshipBudgetRound.year == next_year)
            .filter(SponsorshipBudgetRound.round_number == next_round)
            .filter(SponsorshipBudgetRound.id != record.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Budget round already exists for this year")

    if "year" in fields_set and payload.year is not None:
        record.year = payload.year
    if "round_number" in fields_set and payload.round_number is not None:
        record.round_number = payload.round_number
    if "start_date" in fields_set:
        record.start_date = payload.start_date
    if "end_date" in fields_set:
        record.end_date = payload.end_date
    if "slot_budget" in fields_set and payload.slot_budget is not None:
        record.slot_budget = payload.slot_budget

    if record.start_date and record.end_date and record.end_date < record.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be on or after the start date")

    db.commit()
    db.refresh(record)
    usage = (
        db.query(
            func.coalesce(func.sum(Sponsorship.budget_slots), 0).label("allocated_slots"),
            func.coalesce(func.sum(Sponsorship.used_slots), 0).label("used_slots"),
        )
        .filter(Sponsorship.budget_round_id == record.id)
        .first()
    )
    allocated_slots = int(getattr(usage, "allocated_slots", 0) or 0)
    used_slots = int(getattr(usage, "used_slots", 0) or 0)
    utilization = round((used_slots / record.slot_budget) * 100, 2) if record.slot_budget else 0.0
    return SponsorshipBudgetRoundOut(
        id=record.id,
        year=record.year,
        round_number=record.round_number,
        start_date=record.start_date,
        end_date=record.end_date,
        slot_budget=record.slot_budget,
        allocated_slots=allocated_slots,
        used_slots=used_slots,
        utilization_percent=utilization,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def delete_budget_round(db: Session, round_id: int) -> None:
    record = db.query(SponsorshipBudgetRound).filter(SponsorshipBudgetRound.id == round_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget round not found")
    db.delete(record)
    db.commit()


def get_sponsor_context(db: Session, member_id: int) -> SponsorshipSponsorContext:
    sponsor = db.query(Member).filter(Member.id == member_id).first()
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    today = date.today()
    last_case = (
        db.query(Sponsorship)
        .filter(Sponsorship.sponsor_member_id == member_id)
        .order_by(Sponsorship.created_at.desc())
        .first()
    )
    last_status = last_case.status if last_case else None
    last_date = None
    if last_case:
        last_date = last_case.last_sponsored_date or last_case.start_date or last_case.created_at.date()

    since = date.today() - timedelta(days=365)
    history_count = (
        db.query(func.count(Sponsorship.id))
        .filter(Sponsorship.sponsor_member_id == member_id)
        .filter(Sponsorship.start_date >= since)
        .scalar()
        or 0
    )

    services: list[str] = []
    for raw, fallback in (
        db.query(Sponsorship.volunteer_services, Sponsorship.volunteer_service)
        .filter(Sponsorship.sponsor_member_id == member_id)
        .all()
    ):
        services.extend(_parse_volunteer_services(raw, fallback))
    services = sorted(set([item for item in services if item]))

    start_month = today.month - 35
    start_year = today.year
    while start_month <= 0:
        start_month += 12
        start_year -= 1
    payment_history_start = date(start_year, start_month, 1)
    payment_history_end = today
    payments = (
        db.query(MemberContributionPayment)
        .filter(MemberContributionPayment.member_id == member_id)
        .filter(MemberContributionPayment.paid_at >= payment_history_start)
        .order_by(MemberContributionPayment.paid_at.desc(), MemberContributionPayment.id.desc())
        .all()
    )
    payment_history = [ContributionPaymentOut.from_orm(payment) for payment in payments]

    usage_row = (
        db.query(
            func.coalesce(func.sum(Sponsorship.budget_slots), 0).label("total_slots"),
            func.coalesce(func.sum(Sponsorship.used_slots), 0).label("used_slots"),
        )
        .filter(Sponsorship.sponsor_member_id == member_id)
        .filter(Sponsorship.budget_month == today.month)
        .filter(Sponsorship.budget_year == today.year)
        .first()
    )
    budget_usage = None
    if usage_row:
        total_slots = int(usage_row.total_slots or 0)
        used_slots = int(usage_row.used_slots or 0)
        utilization_percent = round((used_slots / total_slots) * 100, 2) if total_slots > 0 else 0.0
        budget_usage = {
            "month": today.month,
            "year": today.year,
            "total_slots": total_slots,
            "used_slots": used_slots,
            "utilization_percent": utilization_percent,
        }

    return SponsorshipSponsorContext(
        member_id=sponsor.id,
        member_name=f"{sponsor.first_name} {sponsor.last_name}".strip(),
        member_status=sponsor.status,
        last_sponsorship_id=last_case.id if last_case else None,
        last_sponsorship_date=last_date,
        last_sponsorship_status=last_status,
        history_count_last_12_months=history_count,
        volunteer_services=services,
        father_of_repentance_id=getattr(sponsor, "father_confessor_id", None),
        father_of_repentance_name=getattr(getattr(sponsor, "father_confessor", None), "full_name", None),
        budget_usage=budget_usage,
        payment_history_start=payment_history_start,
        payment_history_end=payment_history_end,
        payment_history=payment_history,
    )


def list_sponsorship_timeline(db: Session, sponsorship_id: int) -> SponsorshipTimelineResponse:
    _ = _load_sponsorship(db, sponsorship_id)
    audits = (
        db.query(SponsorshipStatusAudit)
        .options(joinedload(SponsorshipStatusAudit.actor))
        .filter(SponsorshipStatusAudit.sponsorship_id == sponsorship_id)
        .order_by(SponsorshipStatusAudit.changed_at.desc())
        .all()
    )

    items: list[SponsorshipTimelineEvent] = []
    for audit in audits:
        label = "Status updated"
        if audit.action == "StatusChange":
            if audit.from_status is None:
                label = "Created"
            elif audit.to_status:
                label = f"Status: {audit.to_status}"
        elif audit.action == "Approval":
            label = "Approved"
        elif audit.action == "Rejection":
            label = "Rejected"
        elif audit.action == "Suspension":
            label = "Suspended"
        elif audit.action == "Reactivation":
            label = "Resumed"
        elif audit.action == "BeneficiaryChange":
            label = "Beneficiary updated"

        items.append(
            SponsorshipTimelineEvent(
                id=audit.id,
                event_type=audit.action,
                label=label,
                from_status=audit.from_status,
                to_status=audit.to_status,
                reason=audit.reason,
                actor_id=audit.changed_by_id,
                actor_name=_actor_name(audit.actor),
                occurred_at=audit.changed_at,
            )
        )

    return SponsorshipTimelineResponse(items=items, total=len(items))


def list_sponsorship_notes(db: Session, sponsorship_id: int, actor: User) -> SponsorshipNotesListResponse:
    _ = _load_sponsorship(db, sponsorship_id)
    notes = (
        db.query(SponsorshipNote)
        .options(joinedload(SponsorshipNote.author))
        .filter(SponsorshipNote.sponsorship_id == sponsorship_id)
        .order_by(SponsorshipNote.created_at.desc())
        .all()
    )
    allow_all = _is_admin(actor)

    items: list[SponsorshipNoteOut] = []
    for note in notes:
        can_view = allow_all or (note.created_by_id == actor.id)
        items.append(
            SponsorshipNoteOut(
                id=note.id,
                note=note.note if can_view else None,
                restricted=not can_view,
                created_at=note.created_at,
                created_by_id=note.created_by_id,
                created_by_name=_actor_name(note.author),
            )
        )

    return SponsorshipNotesListResponse(items=items, total=len(items))


def create_sponsorship_note(
    db: Session,
    sponsorship_id: int,
    payload: SponsorshipNoteCreate,
    actor: User,
) -> SponsorshipNoteOut:
    _ = _load_sponsorship(db, sponsorship_id)
    note = SponsorshipNote(
        sponsorship_id=sponsorship_id,
        note=payload.note.strip(),
        created_by_id=actor.id,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return SponsorshipNoteOut(
        id=note.id,
        note=note.note,
        restricted=False,
        created_at=note.created_at,
        created_by_id=note.created_by_id,
        created_by_name=_actor_name(actor),
    )
