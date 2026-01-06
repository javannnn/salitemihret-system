from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session, joinedload

from app.models.member import Member
from app.models.newcomer import Newcomer
from app.models.newcomer_tracking import NewcomerAddressHistory, NewcomerInteraction, NewcomerStatusAudit
from app.models.sponsorship import Sponsorship
from app.models.sponsorship_audit import SponsorshipStatusAudit
from app.models.user import User
from app.schemas.newcomer import (
    NewcomerAddressHistoryListResponse,
    NewcomerConvertRequest,
    NewcomerCreate,
    NewcomerInactivateRequest,
    NewcomerInteractionCreate,
    NewcomerInteractionListResponse,
    NewcomerMetrics,
    NewcomerOut,
    NewcomerListResponse,
    NewcomerReactivateRequest,
    NewcomerStatusTransitionRequest,
    NewcomerTimelineEvent,
    NewcomerTimelineResponse,
    NewcomerUpdate,
)
from app.services.members_utils import ensure_household, generate_username

DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
CONVERSION_STATUS_FALLBACK = "Pending"
ALLOWED_MEMBER_STATUSES = {"Active", "Inactive", "Pending", "Archived"}
STATUS_FLOW = ["New", "Contacted", "Assigned", "InProgress", "Settled", "Closed"]
LEGACY_STATUS_MAP = {"Sponsored": "InProgress", "Converted": "Closed"}
VALID_STATUSES = set(STATUS_FLOW)
VALID_HOUSEHOLD_TYPES = {"Individual", "Family"}
DEFAULT_STATUS = "New"
DEFAULT_HOUSEHOLD_TYPE = "Individual"
TEMP_ADDRESS_FIELDS = (
    "temporary_address_street",
    "temporary_address_city",
    "temporary_address_province",
    "temporary_address_postal_code",
)
CURRENT_ADDRESS_FIELDS = (
    "current_address_street",
    "current_address_city",
    "current_address_province",
    "current_address_postal_code",
)


def _coerce_literal(value: str | None) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        value = value.value  # type: ignore[assignment]
    return str(value)


def _normalize_newcomer_status(value: str | None) -> str:
    coerced = _coerce_literal(value)
    if coerced in VALID_STATUSES:
        return coerced
    if coerced in LEGACY_STATUS_MAP:
        return LEGACY_STATUS_MAP[coerced]
    return DEFAULT_STATUS


def _normalize_household_type(value: str | None) -> str:
    coerced = _coerce_literal(value)
    if coerced in VALID_HOUSEHOLD_TYPES:
        return coerced
    return DEFAULT_HOUSEHOLD_TYPE


def _to_schema(
    record: Newcomer,
    *,
    assigned_owner_name: str | None = None,
    sponsored_by_member_name: str | None = None,
    last_interaction_at: datetime | None = None,
    latest_sponsorship_id: int | None = None,
    latest_sponsorship_status: str | None = None,
) -> NewcomerOut:
    base_payload = {field: getattr(record, field, None) for field in NewcomerOut.model_fields}
    base_payload["status"] = _normalize_newcomer_status(base_payload.get("status"))
    base_payload["household_type"] = _normalize_household_type(base_payload.get("household_type"))
    base = NewcomerOut(**base_payload)
    return base.model_copy(
        update={
            "assigned_owner_name": assigned_owner_name,
            "sponsored_by_member_name": sponsored_by_member_name,
            "last_interaction_at": last_interaction_at,
            "latest_sponsorship_id": latest_sponsorship_id,
            "latest_sponsorship_status": latest_sponsorship_status,
        }
    )


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


def _generate_newcomer_code(db: Session) -> str:
    for _ in range(5):
        code = f"NC-{uuid4().hex[:8].upper()}"
        exists = db.query(Newcomer.id).filter(Newcomer.newcomer_code == code).first()
        if not exists:
            return code
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to generate newcomer ID")


def _is_forward_transition(current: str, target: str) -> bool:
    current = _normalize_newcomer_status(current)
    if target == "Closed":
        return True
    try:
        return STATUS_FLOW.index(target) > STATUS_FLOW.index(current)
    except ValueError:
        return False


def _log_status_audit(
    db: Session,
    *,
    newcomer: Newcomer,
    from_status: str | None,
    to_status: str | None,
    reason: str | None,
    actor_id: int | None,
    action: str,
) -> None:
    audit = NewcomerStatusAudit(
        newcomer_id=newcomer.id,
        action=action,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        changed_by_id=actor_id,
    )
    db.add(audit)


def _address_changed(record: Newcomer, payload: NewcomerUpdate, fields: tuple[str, ...]) -> bool:
    for field in fields:
        incoming = getattr(payload, field)
        if incoming is not None and incoming != getattr(record, field):
            return True
    return False


def _log_address_history(
    db: Session,
    *,
    newcomer: Newcomer,
    address_type: str,
    fields: tuple[str, ...],
    actor_id: int | None,
) -> None:
    history = NewcomerAddressHistory(
        newcomer_id=newcomer.id,
        address_type=address_type,
        street=getattr(newcomer, fields[0]),
        city=getattr(newcomer, fields[1]),
        province=getattr(newcomer, fields[2]),
        postal_code=getattr(newcomer, fields[3]),
        changed_by_id=actor_id,
    )
    db.add(history)


def list_newcomers(
    db: Session,
    *,
    page: int,
    page_size: int,
    status_filter: str | None = None,
    assigned_owner_id: int | None = None,
    sponsor_id: int | None = None,
    county: str | None = None,
    interpreter_required: bool | None = None,
    is_inactive: bool | None = None,
    search: str | None = None,
) -> NewcomerListResponse:
    interaction_subq = (
        db.query(
            NewcomerInteraction.newcomer_id.label("newcomer_id"),
            func.max(NewcomerInteraction.occurred_at).label("last_interaction_at"),
        )
        .group_by(NewcomerInteraction.newcomer_id)
        .subquery()
    )
    query = (
        db.query(Newcomer, interaction_subq.c.last_interaction_at)
        .outerjoin(interaction_subq, Newcomer.id == interaction_subq.c.newcomer_id)
        .options(
            joinedload(Newcomer.sponsored_by_member),
            joinedload(Newcomer.assigned_owner),
        )
        .order_by(Newcomer.updated_at.desc())
    )
    if status_filter:
        status_column = cast(Newcomer.status, String)
        if status_filter == "InProgress":
            query = query.filter(status_column.in_(["InProgress", "Sponsored"]))
        elif status_filter == "Closed":
            query = query.filter(status_column.in_(["Closed", "Converted"]))
        else:
            query = query.filter(status_column == status_filter)
    if assigned_owner_id:
        query = query.filter(Newcomer.assigned_owner_id == assigned_owner_id)
    if sponsor_id:
        query = query.filter(Newcomer.sponsored_by_member_id == sponsor_id)
    if county:
        like = f"%{county.strip().lower()}%"
        query = query.filter(func.lower(func.coalesce(Newcomer.county, "")).like(like))
    if interpreter_required is not None:
        query = query.filter(Newcomer.interpreter_required == interpreter_required)
    if is_inactive is not None:
        query = query.filter(Newcomer.is_inactive == is_inactive)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            func.lower(Newcomer.first_name).like(like)
            | func.lower(Newcomer.last_name).like(like)
            | func.lower(func.coalesce(Newcomer.service_type, "")).like(like)
            | func.lower(func.coalesce(Newcomer.newcomer_code, "")).like(like)
        )

    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    newcomer_ids = [row[0].id for row in rows]
    latest_sponsorships: dict[int, Sponsorship] = {}
    if newcomer_ids:
        for record in (
            db.query(Sponsorship)
            .filter(Sponsorship.newcomer_id.in_(newcomer_ids))
            .order_by(Sponsorship.updated_at.desc())
            .all()
        ):
            if record.newcomer_id not in latest_sponsorships:
                latest_sponsorships[record.newcomer_id] = record

    items = []
    for newcomer, last_interaction_at in rows:
        sponsor_name = None
        if newcomer.sponsored_by_member:
            sponsor_name = f"{newcomer.sponsored_by_member.first_name} {newcomer.sponsored_by_member.last_name}".strip()
        assigned_name = None
        if newcomer.assigned_owner:
            assigned_name = newcomer.assigned_owner.full_name or newcomer.assigned_owner.username
        latest = latest_sponsorships.get(newcomer.id)
        items.append(
            _to_schema(
                newcomer,
                assigned_owner_name=assigned_name,
                sponsored_by_member_name=sponsor_name,
                last_interaction_at=last_interaction_at,
                latest_sponsorship_id=latest.id if latest else None,
                latest_sponsorship_status=latest.status if latest else None,
            )
        )

    return NewcomerListResponse(items=items, total=total, page=page, page_size=page_size)


def get_newcomer_metrics(db: Session) -> NewcomerMetrics:
    counts = dict(
        db.query(Newcomer.status, func.count(Newcomer.id))
        .group_by(Newcomer.status)
        .all()
    )
    inactive_count = db.query(func.count(Newcomer.id)).filter(Newcomer.is_inactive.is_(True)).scalar() or 0
    legacy_in_progress = int(counts.get("Sponsored", 0) or 0)
    legacy_closed = int(counts.get("Converted", 0) or 0)
    return NewcomerMetrics(
        new_count=int(counts.get("New", 0) or 0),
        contacted_count=int(counts.get("Contacted", 0) or 0),
        assigned_count=int(counts.get("Assigned", 0) or 0),
        in_progress_count=int(counts.get("InProgress", 0) or 0) + legacy_in_progress,
        settled_count=int(counts.get("Settled", 0) or 0),
        closed_count=int(counts.get("Closed", 0) or 0) + legacy_closed,
        inactive_count=int(inactive_count),
    )


def create_newcomer(db: Session, payload: NewcomerCreate) -> NewcomerOut:
    followup_due = payload.followup_due_date or payload.arrival_date + timedelta(days=7)
    record = Newcomer(
        newcomer_code=_generate_newcomer_code(db),
        first_name=payload.first_name.strip(),
        last_name=payload.last_name.strip(),
        household_type=payload.household_type,
        preferred_language=payload.preferred_language,
        interpreter_required=payload.interpreter_required,
        contact_phone=payload.contact_phone.strip() if payload.contact_phone else None,
        contact_whatsapp=payload.contact_whatsapp.strip() if payload.contact_whatsapp else None,
        contact_email=payload.contact_email,
        family_size=payload.family_size,
        service_type=payload.service_type,
        arrival_date=payload.arrival_date,
        country=payload.country,
        temporary_address=payload.temporary_address,
        temporary_address_street=payload.temporary_address_street,
        temporary_address_city=payload.temporary_address_city,
        temporary_address_province=payload.temporary_address_province,
        temporary_address_postal_code=payload.temporary_address_postal_code,
        current_address_street=payload.current_address_street,
        current_address_city=payload.current_address_city,
        current_address_province=payload.current_address_province,
        current_address_postal_code=payload.current_address_postal_code,
        county=payload.county.strip() if payload.county else None,
        referred_by=payload.referred_by,
        past_profession=payload.past_profession,
        notes=payload.notes,
        status=payload.status,
        is_inactive=payload.is_inactive,
        inactive_reason=payload.inactive_reason,
        inactive_at=payload.inactive_at,
        inactive_by_id=payload.inactive_by_id,
        sponsored_by_member_id=payload.sponsored_by_member_id,
        father_of_repentance_id=payload.father_of_repentance_id,
        assigned_owner_id=payload.assigned_owner_id,
        followup_due_date=followup_due,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_schema(record)


def update_newcomer(db: Session, newcomer_id: int, payload: NewcomerUpdate, actor_id: int | None) -> NewcomerOut:
    record = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    if payload.status is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update settlement status via the status endpoint")
    if (
        payload.is_inactive is not None
        or payload.inactive_reason is not None
        or payload.inactive_at is not None
        or payload.inactive_by_id is not None
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Update inactivity via the inactivation endpoint")

    if _address_changed(record, payload, TEMP_ADDRESS_FIELDS):
        _log_address_history(
            db,
            newcomer=record,
            address_type="Temporary",
            fields=TEMP_ADDRESS_FIELDS,
            actor_id=actor_id,
        )
    if _address_changed(record, payload, CURRENT_ADDRESS_FIELDS):
        _log_address_history(
            db,
            newcomer=record,
            address_type="Current",
            fields=CURRENT_ADDRESS_FIELDS,
            actor_id=actor_id,
        )

    if payload.first_name is not None:
        record.first_name = payload.first_name.strip()
    if payload.last_name is not None:
        record.last_name = payload.last_name.strip()
    if payload.household_type is not None:
        record.household_type = payload.household_type
    if payload.preferred_language is not None:
        record.preferred_language = payload.preferred_language
    if payload.interpreter_required is not None:
        record.interpreter_required = payload.interpreter_required
    if payload.contact_phone is not None:
        record.contact_phone = payload.contact_phone.strip() if payload.contact_phone else None
    if payload.contact_whatsapp is not None:
        record.contact_whatsapp = payload.contact_whatsapp.strip() if payload.contact_whatsapp else None
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
    if payload.temporary_address_street is not None:
        record.temporary_address_street = payload.temporary_address_street
    if payload.temporary_address_city is not None:
        record.temporary_address_city = payload.temporary_address_city
    if payload.temporary_address_province is not None:
        record.temporary_address_province = payload.temporary_address_province
    if payload.temporary_address_postal_code is not None:
        record.temporary_address_postal_code = payload.temporary_address_postal_code
    if payload.current_address_street is not None:
        record.current_address_street = payload.current_address_street
    if payload.current_address_city is not None:
        record.current_address_city = payload.current_address_city
    if payload.current_address_province is not None:
        record.current_address_province = payload.current_address_province
    if payload.current_address_postal_code is not None:
        record.current_address_postal_code = payload.current_address_postal_code
    if payload.county is not None:
        record.county = payload.county.strip() if payload.county else None
    if payload.referred_by is not None:
        record.referred_by = payload.referred_by
    if payload.past_profession is not None:
        record.past_profession = payload.past_profession
    if payload.notes is not None:
        record.notes = payload.notes
    if payload.sponsored_by_member_id is not None:
        record.sponsored_by_member_id = payload.sponsored_by_member_id
    if payload.father_of_repentance_id is not None:
        record.father_of_repentance_id = payload.father_of_repentance_id
    if payload.assigned_owner_id is not None:
        previous_owner_id = record.assigned_owner_id
        record.assigned_owner_id = payload.assigned_owner_id or None
        if record.assigned_owner_id != previous_owner_id:
            assignee_name = None
            if record.assigned_owner_id:
                assignee = db.query(User).filter(User.id == record.assigned_owner_id).first()
                assignee_name = assignee.full_name or assignee.username if assignee else None
            reason = f"Assigned to {assignee_name}" if assignee_name else "Assignment updated"
            _log_status_audit(
                db,
                newcomer=record,
                from_status=record.status,
                to_status=record.status,
                reason=reason,
                actor_id=actor_id,
                action="Assignment",
            )
    if payload.followup_due_date is not None:
        record.followup_due_date = payload.followup_due_date

    if not record.contact_email and not record.contact_phone and not record.contact_whatsapp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a phone, WhatsApp, or email for the newcomer")

    db.commit()
    db.refresh(record)
    return _to_schema(record)


def get_newcomer(db: Session, newcomer_id: int) -> NewcomerOut:
    record = (
        db.query(Newcomer)
        .options(
            joinedload(Newcomer.sponsored_by_member),
            joinedload(Newcomer.assigned_owner),
        )
        .filter(Newcomer.id == newcomer_id)
        .first()
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    last_interaction_at = (
        db.query(func.max(NewcomerInteraction.occurred_at))
        .filter(NewcomerInteraction.newcomer_id == newcomer_id)
        .scalar()
    )
    latest_sponsorship = (
        db.query(Sponsorship)
        .filter(Sponsorship.newcomer_id == newcomer_id)
        .order_by(Sponsorship.updated_at.desc())
        .first()
    )
    sponsor_name = None
    if record.sponsored_by_member:
        sponsor_name = f"{record.sponsored_by_member.first_name} {record.sponsored_by_member.last_name}".strip()
    assigned_name = None
    if record.assigned_owner:
        assigned_name = record.assigned_owner.full_name or record.assigned_owner.username
    return _to_schema(
        record,
        assigned_owner_name=assigned_name,
        sponsored_by_member_name=sponsor_name,
        last_interaction_at=last_interaction_at,
        latest_sponsorship_id=latest_sponsorship.id if latest_sponsorship else None,
        latest_sponsorship_status=latest_sponsorship.status if latest_sponsorship else None,
    )


def transition_newcomer_status(
    db: Session,
    newcomer_id: int,
    payload: NewcomerStatusTransitionRequest,
    actor_id: int | None,
) -> NewcomerOut:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    current = newcomer.status
    current_normalized = _normalize_newcomer_status(current)
    target = payload.status
    if current_normalized == target:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer already in this status")

    action = "StatusChange"
    if current_normalized == "Closed" and target != "Closed":
        if not payload.reason:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide a reason to reopen a closed case")
        action = "Reopen"
    else:
        if not _is_forward_transition(current_normalized, target):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status transition")

    newcomer.status = target
    _log_status_audit(
        db,
        newcomer=newcomer,
        from_status=current_normalized,
        to_status=target,
        reason=payload.reason,
        actor_id=actor_id,
        action=action,
    )

    db.commit()
    db.refresh(newcomer)
    return _to_schema(newcomer)


def inactivate_newcomer(
    db: Session,
    newcomer_id: int,
    payload: NewcomerInactivateRequest,
    actor_id: int | None,
) -> NewcomerOut:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    if newcomer.is_inactive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer is already inactive")

    newcomer.is_inactive = True
    newcomer.inactive_reason = payload.reason.strip()
    newcomer.inactive_notes = payload.notes.strip()
    newcomer.inactive_at = datetime.utcnow()
    newcomer.inactive_by_id = actor_id
    _log_status_audit(
        db,
        newcomer=newcomer,
        from_status=newcomer.status,
        to_status=newcomer.status,
        reason=payload.reason,
        actor_id=actor_id,
        action="Inactivate",
    )

    db.commit()
    db.refresh(newcomer)
    return _to_schema(newcomer)


def reactivate_newcomer(
    db: Session,
    newcomer_id: int,
    payload: NewcomerReactivateRequest,
    actor_id: int | None,
) -> NewcomerOut:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")
    if not newcomer.is_inactive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer is not inactive")

    newcomer.is_inactive = False
    newcomer.inactive_reason = None
    newcomer.inactive_notes = None
    newcomer.inactive_at = None
    newcomer.inactive_by_id = None
    _log_status_audit(
        db,
        newcomer=newcomer,
        from_status=newcomer.status,
        to_status=newcomer.status,
        reason=payload.reason,
        actor_id=actor_id,
        action="Reactivate",
    )

    db.commit()
    db.refresh(newcomer)
    return _to_schema(newcomer)


def list_interactions(
    db: Session,
    newcomer_id: int,
    *,
    actor_id: int | None,
    include_restricted: bool,
) -> NewcomerInteractionListResponse:
    if not db.query(Newcomer).filter(Newcomer.id == newcomer_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    query = db.query(NewcomerInteraction).filter(NewcomerInteraction.newcomer_id == newcomer_id)
    if not include_restricted:
        query = query.filter(
            (NewcomerInteraction.visibility == "Shared") | (NewcomerInteraction.created_by_id == actor_id)
        )
    query = query.order_by(NewcomerInteraction.occurred_at.desc())
    total = query.count()
    items = query.all()
    return NewcomerInteractionListResponse(
        items=items,
        total=total,
    )


def create_interaction(
    db: Session,
    newcomer_id: int,
    payload: NewcomerInteractionCreate,
    actor_id: int | None,
) -> NewcomerInteraction:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    interaction = NewcomerInteraction(
        newcomer_id=newcomer.id,
        interaction_type=payload.interaction_type,
        visibility="Restricted",
        note=payload.note.strip(),
        occurred_at=payload.occurred_at or datetime.utcnow(),
        created_by_id=actor_id,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction


def list_address_history(db: Session, newcomer_id: int) -> NewcomerAddressHistoryListResponse:
    if not db.query(Newcomer).filter(Newcomer.id == newcomer_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    query = (
        db.query(NewcomerAddressHistory)
        .filter(NewcomerAddressHistory.newcomer_id == newcomer_id)
        .order_by(NewcomerAddressHistory.changed_at.desc())
    )
    items = query.all()
    return NewcomerAddressHistoryListResponse(items=items, total=len(items))


def list_timeline(db: Session, newcomer_id: int, actor: User) -> NewcomerTimelineResponse:
    newcomer = db.query(Newcomer).filter(Newcomer.id == newcomer_id).first()
    if not newcomer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Newcomer not found")

    is_admin = actor.is_super_admin or any(role.name == "Admin" for role in actor.roles)

    events: list[NewcomerTimelineEvent] = []

    audits = (
        db.query(NewcomerStatusAudit)
        .options(joinedload(NewcomerStatusAudit.actor))
        .filter(NewcomerStatusAudit.newcomer_id == newcomer_id)
        .order_by(NewcomerStatusAudit.changed_at.desc())
        .all()
    )
    for audit in audits:
        label = "Status updated"
        if audit.action == "StatusChange":
            if audit.from_status is None:
                label = "Created"
            elif audit.to_status:
                label = f"Status: {audit.to_status}"
        elif audit.action == "Reopen":
            label = "Reopened"
        elif audit.action == "Inactivate":
            label = "Marked inactive"
        elif audit.action == "Reactivate":
            label = "Reactivated"
        elif audit.action == "Assignment":
            label = "Assignment updated"
        elif audit.action == "SponsorshipLink":
            label = "Sponsorship linked"
        elif audit.action == "SponsorshipUnlink":
            label = "Sponsorship unlinked"

        events.append(
            NewcomerTimelineEvent(
                id=audit.id,
                event_type=audit.action,
                label=label,
                detail=audit.reason,
                actor_id=audit.changed_by_id,
                actor_name=audit.actor.full_name if audit.actor else None,
                occurred_at=audit.changed_at,
            )
        )

    interactions = (
        db.query(NewcomerInteraction)
        .options(joinedload(NewcomerInteraction.author))
        .filter(NewcomerInteraction.newcomer_id == newcomer_id)
        .order_by(NewcomerInteraction.occurred_at.desc())
        .all()
    )
    for interaction in interactions:
        can_view = is_admin or (interaction.created_by_id == actor.id)
        detail = interaction.note if can_view else "Restricted note logged."
        events.append(
            NewcomerTimelineEvent(
                id=interaction.id,
                event_type="Interaction",
                label=f"Interaction: {interaction.interaction_type}",
                detail=detail,
                actor_id=interaction.created_by_id,
                actor_name=interaction.author.full_name if interaction.author else None,
                occurred_at=interaction.occurred_at,
            )
        )

    histories = (
        db.query(NewcomerAddressHistory)
        .options(joinedload(NewcomerAddressHistory.actor))
        .filter(NewcomerAddressHistory.newcomer_id == newcomer_id)
        .order_by(NewcomerAddressHistory.changed_at.desc())
        .all()
    )
    for history in histories:
        address_bits = ", ".join(filter(None, [history.street, history.city, history.province, history.postal_code]))
        events.append(
            NewcomerTimelineEvent(
                id=history.id,
                event_type="Address",
                label=f"Address updated ({history.address_type})",
                detail=address_bits or None,
                actor_id=history.changed_by_id,
                actor_name=history.actor.full_name if history.actor else None,
                occurred_at=history.changed_at,
            )
        )

    events.sort(key=lambda item: item.occurred_at, reverse=True)
    return NewcomerTimelineResponse(items=events, total=len(events))


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
    if newcomer.converted_member_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Newcomer already converted")

    member: Member
    if payload.member_id:
        member = db.query(Member).filter(Member.id == payload.member_id).first()
        if not member:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        _ensure_member_contact_unique(db, phone=member.phone, email=member.email, exclude_member_id=member.id)
    else:
        member = _create_member_from_newcomer(db, newcomer, payload, actor_id)

    previous_status = newcomer.status
    newcomer.status = "Closed"
    newcomer.converted_member_id = member.id
    newcomer.followup_due_date = None
    _log_status_audit(
        db,
        newcomer=newcomer,
        from_status=previous_status,
        to_status="Closed",
        reason="Converted to member",
        actor_id=actor_id,
        action="StatusChange",
    )

    # Link any pending sponsorships to the new member and audit the change
    linked_sponsorships = (
        db.query(Sponsorship)
        .filter(Sponsorship.newcomer_id == newcomer.id)
        .all()
    )
    for sponsorship in linked_sponsorships:
        old_label = sponsorship.beneficiary_name
        sponsorship.beneficiary_member_id = member.id
        sponsorship.newcomer_id = None
        sponsorship.beneficiary_name = f"{member.first_name} {member.last_name}".strip()
        db.add(
            SponsorshipStatusAudit(
                sponsorship_id=sponsorship.id,
                action="BeneficiaryChange",
                from_status=sponsorship.status,
                to_status=sponsorship.status,
                reason=f"Beneficiary changed: {old_label} -> {sponsorship.beneficiary_name}",
                changed_by_id=actor_id,
            )
        )
        _log_status_audit(
            db,
            newcomer=newcomer,
            from_status=newcomer.status,
            to_status=newcomer.status,
            reason=f"Sponsorship case #{sponsorship.id} unlinked",
            actor_id=actor_id,
            action="SponsorshipUnlink",
        )

    db.commit()
    db.refresh(newcomer)
    return _to_schema(newcomer)
