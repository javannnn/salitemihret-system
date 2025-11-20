from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
import math
import json

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.member import Member
from app.models.newcomer import Newcomer
from app.models.payment import Payment
from app.models.payment import PaymentServiceType
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.priest import Priest
from app.models.sponsorship import Sponsorship
from app.schemas.sponsorship import (
    MemberSummary,
    NewcomerSummary,
    SponsorshipCreate,
    SponsorshipListResponse,
    SponsorshipOut,
    SponsorshipUpdate,
)

SPONSOR_SERVICE_CODE = "Sponsorship"
ALLOWED_SPONSOR_STATUSES = {"Active", "Pending"}


def _member_summary(member: Member | None) -> MemberSummary | None:
    if not member:
        return None
    return MemberSummary.from_orm(member)


def _newcomer_summary(newcomer: Newcomer | None) -> NewcomerSummary | None:
    if not newcomer:
        return None
    return NewcomerSummary.from_orm(newcomer)


def _parse_volunteer_services(raw: str | None, fallback: str | None = None) -> list[str]:
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


def _build_payment_health(db: Session, member: Member) -> dict | None:
    if not member:
        return None
    last_payment = (
        db.query(MemberContributionPayment)
        .filter(MemberContributionPayment.member_id == member.id)
        .order_by(MemberContributionPayment.paid_at.desc(), MemberContributionPayment.id.desc())
        .first()
    )
    last_payment_date = last_payment.paid_at if last_payment else None
    days_since_payment = (date.today() - last_payment_date).days if last_payment_date else None
    status_value = "Green"
    if not member.pays_contribution:
        status_value = "Red"
    elif days_since_payment is None:
        status_value = "Yellow"
    elif days_since_payment > 60:
        status_value = "Red"
    elif days_since_payment > 30:
        status_value = "Yellow"

    return {
        "monthly_contribution": float(Decimal(member.contribution_amount or 0).quantize(Decimal("0.01"))),
        "method": member.contribution_method,
        "last_payment_date": last_payment_date,
        "status": status_value,
        "days_since_last_payment": days_since_payment,
    }


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


def _calculate_periods(sponsorship: Sponsorship, reference_date: date | None = None) -> int:
    start = sponsorship.start_date
    end = sponsorship.end_date or reference_date or date.today()
    if not start:
        return 1
    if end < start:
        end = start

    if sponsorship.frequency == "OneTime":
        return 1

    months = (end.year - start.year) * 12 + (end.month - start.month) + 1
    months = max(1, months)

    if sponsorship.frequency == "Monthly":
        return months
    if sponsorship.frequency == "Quarterly":
        return max(1, math.ceil(months / 3))
    if sponsorship.frequency == "Yearly":
        return max(1, math.ceil(months / 12))
    return 1


def _calculate_amount_paid(db: Session, sponsorship: Sponsorship) -> Decimal:
    query = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .join(Payment.service_type)
        .filter(Payment.member_id == sponsorship.sponsor_member_id)
        .filter(PaymentServiceType.code == SPONSOR_SERVICE_CODE)
    )
    if sponsorship.start_date:
        query = query.filter(Payment.posted_at >= datetime.combine(sponsorship.start_date, time.min))
    if sponsorship.end_date:
        query = query.filter(Payment.posted_at <= datetime.combine(sponsorship.end_date, time.max))
    result = query.scalar() or 0
    return Decimal(result).quantize(Decimal("0.01"))


def _serialize(db: Session, sponsorship: Sponsorship) -> SponsorshipOut:
    amount_paid = _calculate_amount_paid(db, sponsorship)
    periods = _calculate_periods(sponsorship)
    pledged_total = (sponsorship.monthly_amount or Decimal("0")) * periods
    outstanding = pledged_total - amount_paid
    if outstanding < 0:
        outstanding = Decimal("0.00")

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

    payment_health = None
    if sponsorship.sponsor:
        payment_health = _build_payment_health(db, sponsorship.sponsor)

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
        status=sponsorship.status,  # type: ignore[arg-type]
        monthly_amount=Decimal(sponsorship.monthly_amount or 0).quantize(Decimal("0.01")),
        program=sponsorship.program,  # type: ignore[arg-type]
        pledge_channel=sponsorship.pledge_channel,  # type: ignore[arg-type]
        reminder_channel=sponsorship.reminder_channel,  # type: ignore[arg-type]
        motivation=sponsorship.motivation,  # type: ignore[arg-type]
        start_date=sponsorship.start_date,
        end_date=sponsorship.end_date,
        last_status=sponsorship.last_status,  # type: ignore[arg-type]
        last_status_reason=sponsorship.last_status_reason,
        budget_month=sponsorship.budget_month,
        budget_year=sponsorship.budget_year,
        budget_amount=Decimal(sponsorship.budget_amount or 0).quantize(Decimal("0.01")) if sponsorship.budget_amount else None,
        budget_slots=sponsorship.budget_slots,
        used_slots=sponsorship.used_slots or 0,
        budget_utilization_percent=budget_utilization_percent,
        budget_over_capacity=budget_over_capacity,
        notes=sponsorship.notes,
        notes_template=sponsorship.notes_template,  # type: ignore[arg-type]
        reminder_last_sent=sponsorship.reminder_last_sent,
        reminder_next_due=sponsorship.reminder_next_due,
        assigned_staff_id=sponsorship.assigned_staff_id,
        amount_paid=amount_paid,
        pledged_total=pledged_total.quantize(Decimal("0.01")),
        outstanding_balance=outstanding.quantize(Decimal("0.01")),
        sponsor_status=sponsorship.sponsor.status if sponsorship.sponsor else None,
        father_of_repentance_name=father_name,
        payment_health=payment_health,
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
    frequency: str | None = None,
    search: str | None = None,
    has_newcomer: bool | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> SponsorshipListResponse:
    query = (
        db.query(Sponsorship)
        .options(
            joinedload(Sponsorship.sponsor),
            joinedload(Sponsorship.beneficiary_member),
            joinedload(Sponsorship.newcomer),
            joinedload(Sponsorship.father_of_repentance),
        )
        .order_by(Sponsorship.updated_at.desc())
    )

    if status_filter:
        query = query.filter(Sponsorship.status == status_filter)
    if program:
        query = query.filter(Sponsorship.program == program)
    if sponsor_id:
        query = query.filter(Sponsorship.sponsor_member_id == sponsor_id)
    if frequency:
        query = query.filter(Sponsorship.frequency == frequency)
    if has_newcomer is not None:
        if has_newcomer:
            query = query.filter(Sponsorship.newcomer_id.isnot(None))
        else:
            query = query.filter(Sponsorship.newcomer_id.is_(None))
    if start_date:
        query = query.filter(Sponsorship.start_date >= start_date)
    if end_date:
        query = query.filter(Sponsorship.start_date <= end_date)
    if search:
        like = f"%{search.lower()}%"
        query = query.join(Sponsorship.sponsor).filter(
            func.lower(Member.first_name).like(like)
            | func.lower(Member.last_name).like(like)
            | func.lower(Sponsorship.beneficiary_name).like(like)
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
    sponsor_id: int,
    beneficiary_member_id: int | None,
    newcomer_id: int | None,
    exclude_id: int | None = None,
) -> None:
    query = db.query(Sponsorship).filter(Sponsorship.sponsor_member_id == sponsor_id, Sponsorship.status != "Completed")
    if exclude_id:
        query = query.filter(Sponsorship.id != exclude_id)
    if beneficiary_member_id:
        query = query.filter(Sponsorship.beneficiary_member_id == beneficiary_member_id)
    if newcomer_id:
        query = query.filter(Sponsorship.newcomer_id == newcomer_id)
    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sponsor already has an active sponsorship for this beneficiary.",
        )


def create_sponsorship(db: Session, payload: SponsorshipCreate, actor_id: int | None) -> SponsorshipOut:
    sponsor = _validate_member(db, payload.sponsor_member_id)
    beneficiary_member = None
    if payload.beneficiary_member_id:
        beneficiary_member = _load_member(db, payload.beneficiary_member_id)

    newcomer = None
    if payload.newcomer_id:
        newcomer = _load_newcomer(db, payload.newcomer_id)
        if newcomer.status in ("Converted", "Closed"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer is already closed")

    if payload.father_of_repentance_id:
        _load_priest(db, payload.father_of_repentance_id)

    _ensure_no_conflict(
        db,
        sponsor_id=sponsor.id,
        beneficiary_member_id=beneficiary_member.id if beneficiary_member else None,
        newcomer_id=newcomer.id if newcomer else None,
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

    sponsorship = Sponsorship(
        sponsor_member_id=sponsor.id,
        beneficiary_member_id=beneficiary_member.id if beneficiary_member else None,
        newcomer_id=newcomer.id if newcomer else None,
        beneficiary_name=_normalize_beneficiary_name(
            beneficiary_name=payload.beneficiary_name,
            beneficiary_member=beneficiary_member,
            newcomer=newcomer,
        ),
        father_of_repentance_id=father_id,
        volunteer_service=legacy_service_value,
        volunteer_services=volunteer_services_raw,
        volunteer_service_other=payload.volunteer_service_other,
        payment_information=payload.payment_information,
        last_sponsored_date=payload.last_sponsored_date,
        frequency=payload.frequency,
        last_status=payload.last_status,
        last_status_reason=payload.last_status_reason,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=payload.status,
        monthly_amount=Decimal(payload.monthly_amount).quantize(Decimal("0.01")),
        program=payload.program,
        pledge_channel=payload.pledge_channel,
        reminder_channel=payload.reminder_channel,
        motivation=payload.motivation,
        budget_month=payload.budget_month,
        budget_year=payload.budget_year,
        budget_amount=Decimal(payload.budget_amount).quantize(Decimal("0.01")) if payload.budget_amount else None,
        budget_slots=payload.budget_slots,
        used_slots=0,
        notes=payload.notes,
        notes_template=payload.notes_template,
        assigned_staff_id=payload.assigned_staff_id,
        created_by_id=actor_id,
        updated_by_id=actor_id,
    )
    db.add(sponsorship)

    if newcomer and newcomer.status == "New":
        newcomer.status = "Sponsored"

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
        sponsorship.frequency = payload.frequency
    if payload.last_status is not None:
        sponsorship.last_status = payload.last_status
    if payload.last_status_reason is not None:
        sponsorship.last_status_reason = payload.last_status_reason
    if payload.start_date:
        sponsorship.start_date = payload.start_date
    if payload.end_date is not None:
        sponsorship.end_date = payload.end_date
    if payload.status:
        sponsorship.status = payload.status
    if payload.monthly_amount:
        sponsorship.monthly_amount = Decimal(payload.monthly_amount).quantize(Decimal("0.01"))
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
    if payload.budget_amount is not None:
        sponsorship.budget_amount = Decimal(payload.budget_amount).quantize(Decimal("0.01"))
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
        sponsor_id=sponsorship.sponsor_member_id,
        beneficiary_member_id=sponsorship.beneficiary_member_id,
        newcomer_id=sponsorship.newcomer_id,
        exclude_id=sponsorship.id,
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


def trigger_reminder(db: Session, sponsorship_id: int) -> SponsorshipOut:
    sponsorship = _load_sponsorship(db, sponsorship_id)
    now = datetime.utcnow()
    interval_days = REMINDER_INTERVALS.get(sponsorship.frequency, 30)
    sponsorship.reminder_last_sent = now
    sponsorship.reminder_next_due = now + timedelta(days=interval_days)  # type: ignore[name-defined]
    db.commit()
    db.refresh(sponsorship)
    return _serialize(db, sponsorship)


def get_sponsorship_metrics(db: Session) -> dict:
    today = date.today()
    total_active = (
        db.query(func.count(Sponsorship.id))
        .filter(Sponsorship.status == "Active")
        .scalar()
        or 0
    )
    newcomers_sponsored = (
        db.query(func.count(Sponsorship.id))
        .filter(Sponsorship.newcomer_id.isnot(None))
        .scalar()
        or 0
    )
    month_sponsorships = (
        db.query(func.count(Sponsorship.id))
        .filter(func.extract("month", Sponsorship.start_date) == today.month)
        .filter(func.extract("year", Sponsorship.start_date) == today.year)
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

    delinquent_sponsors = (
        db.query(func.count(Sponsorship.id))
        .join(Sponsorship.sponsor)
        .filter(Sponsorship.status == "Active")
        .filter(Member.pays_contribution.is_(False))
        .scalar()
        or 0
    )
    if delinquent_sponsors:
        alerts.append(f"{delinquent_sponsors} sponsor(s) have paused membership contributions.")

    return {
        "total_active_sponsors": total_active,
        "newcomers_sponsored": newcomers_sponsored,
        "month_sponsorships": month_sponsorships,
        "budget_utilization_percent": percent_utilization,
        "current_budget": current_budget,
        "alerts": alerts,
    }
