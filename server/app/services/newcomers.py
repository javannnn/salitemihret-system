from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.newcomer import Newcomer
from app.models.sponsorship import Sponsorship
from app.schemas.newcomer import (
    NewcomerConvertRequest,
    NewcomerCreate,
    NewcomerListResponse,
    NewcomerOut,
    NewcomerUpdate,
)
from app.services.members_utils import ensure_household, generate_username

DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
CONVERSION_STATUS_FALLBACK = "Pending"
ALLOWED_MEMBER_STATUSES = {"Active", "Inactive", "Pending", "Archived"}


def _to_schema(record: Newcomer) -> NewcomerOut:
    return NewcomerOut.from_orm(record)


def _ensure_member_contact_unique(db: Session, *, phone: str | None, email: str | None, exclude_member_id: int | None = None) -> None:
    query = db.query(Member)
    filters = []
    if phone:
        filters.append(Member.phone == phone.strip())
    if email:
        filters.append(func.lower(Member.email) == email.lower())
    if not filters:
        return
    query = query.filter(or_(*filters))
    if exclude_member_id:
        query = query.filter(Member.id != exclude_member_id)
    if query.first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone or email already used by another member")


def list_newcomers(
    db: Session,
    *,
    page: int,
    page_size: int,
    status_filter: str | None = None,
    owner_id: int | None = None,
    sponsor_id: int | None = None,
    search: str | None = None,
) -> NewcomerListResponse:
    query = db.query(Newcomer).order_by(Newcomer.updated_at.desc())
    if status_filter:
        query = query.filter(Newcomer.status == status_filter)
    if owner_id:
        query = query.filter(Newcomer.assigned_owner_id == owner_id)
    if sponsor_id:
        query = query.filter(Newcomer.sponsored_by_member_id == sponsor_id)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Newcomer.first_name).like(like)
            | func.lower(Newcomer.last_name).like(like)
            | func.lower(func.coalesce(Newcomer.service_type, "")).like(like)
        )

    total = query.count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return NewcomerListResponse(items=[_to_schema(item) for item in items], total=total, page=page, page_size=page_size)


def create_newcomer(db: Session, payload: NewcomerCreate) -> NewcomerOut:
    followup_due = payload.followup_due_date or payload.arrival_date + timedelta(days=7)
    record = Newcomer(
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        preferred_language=payload.preferred_language,
        contact_phone=payload.contact_phone.strip() if payload.contact_phone else None,
        contact_email=payload.contact_email,
        family_size=payload.family_size,
        service_type=payload.service_type,
        arrival_date=payload.arrival_date,
        country=payload.country,
        temporary_address=payload.temporary_address,
        referred_by=payload.referred_by,
        notes=payload.notes,
        status=payload.status,
        sponsored_by_member_id=payload.sponsored_by_member_id,
        father_of_repentance_id=payload.father_of_repentance_id,
        assigned_owner_id=payload.assigned_owner_id,
        followup_due_date=followup_due,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_schema(record)


def update_newcomer(db: Session, newcomer_id: int, payload: NewcomerUpdate) -> NewcomerOut:
    record = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    if payload.first_name is not None:
        record.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        record.last_name = payload.last_name.strip()
    if payload.preferred_language is not None:
        record.preferred_language = payload.preferred_language
    if payload.contact_phone is not None:
        record.contact_phone = payload.contact_phone.strip() if payload.contact_phone else None
    if payload.contact_email is not None:
        record.contact_email = payload.contact_email
    if payload.family_size is not None:
        record.family_size = payload.family_size
    if payload.service_type is not None:
        record.service_type = payload.service_type
    if payload.arrival_date is not None:
        if payload.arrival_date > date.today():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Arrival date cannot be in the future")
        record.arrival_date = payload.arrival_date
    if payload.country is not None:
        record.country = payload.country
    if payload.temporary_address is not None:
        record.temporary_address = payload.temporary_address
    if payload.referred_by is not None:
        record.referred_by = payload.referred_by
    if payload.notes is not None:
        record.notes = payload.notes
    if payload.status is not None:
        if payload.status == "Converted" and not record.converted_member_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Convert newcomer via the conversion endpoint")
        record.status = payload.status
    if payload.sponsored_by_member_id is not None:
        record.sponsored_by_member_id = payload.sponsored_by_member_id
    if payload.father_of_repentance_id is not None:
        record.father_of_repentance_id = payload.father_of_repentance_id
    if payload.assigned_owner_id is not None:
        record.assigned_owner_id = payload.assigned_owner_id
    if payload.followup_due_date is not None:
        record.followup_due_date = payload.followup_due_date

    if not record.contact_email and not record.contact_phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a phone or email for the newcomer")

    db.commit()
    db.refresh(record)
    return _to_schema(record)


def get_newcomer(db: Session, newcomer_id: int) -> NewcomerOut:
    record = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    return _to_schema(record)


def _create_member_from_newcomer(
    db: Session,
    newcomer: Newcomer,
    payload: NewcomerConvertRequest,
    actor_id: Optional[int],
) -> Member:
    phone = (payload.phone or newcomer.contact_phone or "").strip()
    email = payload.email or newcomer.contact_email
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Phone is required to create a member")
    _ensure_member_contact_unique(db, phone=phone, email=email)

    first_name = (payload.first_name or newcomer.first_name).strip()
    last_name = (payload.last_name or newcomer.last_name).strip()
    username = generate_username(db, first_name, last_name)
    target_status = payload.status or CONVERSION_STATUS_FALLBACK
    if target_status not in ALLOWED_MEMBER_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member status")

    member = Member(
        first_name=first_name,
        last_name=last_name,
        username=username,
        phone=phone,
        email=email,
        status=target_status,
        join_date=date.today(),
        district=payload.district,
        address=newcomer.temporary_address,
        address_country=newcomer.country,
        notes="\n".join(filter(None, [newcomer.notes, payload.notes])),
        pays_contribution=False,
        contribution_method=None,
        contribution_amount=DEFAULT_CONTRIBUTION_AMOUNT,
        contribution_currency="CAD",
        is_tither=False,
        created_by_id=actor_id,
        updated_by_id=actor_id,
        has_father_confessor=bool(newcomer.father_of_repentance_id),
        father_confessor_id=newcomer.father_of_repentance_id,
    )
    if payload.household_name:
        member.household = ensure_household(db, payload.household_name)
    db.add(member)
    db.flush()
    return member


def convert_newcomer(db: Session, newcomer_id: int, payload: NewcomerConvertRequest, actor_id: Optional[int]) -> NewcomerOut:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    if newcomer.status == "Converted":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer already converted")

    member: Member
    if payload.member_id:
        member = db.query(Member).filter(Member.id == payload.member_id).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        _ensure_member_contact_unique(db, phone=member.phone, email=member.email, exclude_member_id=member.id)
    else:
        member = _create_member_from_newcomer(db, newcomer, payload, actor_id)

    newcomer.status = "Converted"
    newcomer.converted_member_id = member.id
    newcomer.followup_due_date = None

    # Link any pending sponsorships to the new member
    (
        db.query(Sponsorship)
        .filter(Sponsorship.newcomer_id == newcomer.id)
        .update(
            {
                Sponsorship.beneficiary_member_id: member.id,
                Sponsorship.newcomer_id: None,
                Sponsorship.beneficiary_name: f"{member.first_name} {member.last_name}",
            },
            synchronize_session=False,
        )
    )

    db.commit()
    db.refresh(newcomer)
    return _to_schema(newcomer)
