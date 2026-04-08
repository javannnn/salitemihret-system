from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.member import Member
from app.models.member_audit import MemberAudit
from app.models.member_contribution_payment import MemberContributionPayment
from app.models.payment import Payment
from app.models.user import User
from app.schemas.member import MemberTimelineEvent, MemberTimelineResponse
from app.services.membership import build_membership_events, refresh_membership_state

_STATUS_FIELDS = {"status", "status_override_value", "status_override_reason", "deleted_at"}
_COMMUNITY_FIELDS = {"tags", "ministries", "household_id", "child_promoted", "origin"}
_FIELD_LABELS = {
    "first_name": "First name",
    "middle_name": "Middle name",
    "last_name": "Last name",
    "email": "Email",
    "phone": "Phone",
    "birth_date": "Birth date",
    "join_date": "Join date",
    "gender": "Gender",
    "baptismal_name": "Baptismal name",
    "marital_status": "Marital status",
    "address": "Address",
    "address_street": "Street address",
    "address_city": "City",
    "address_region": "Region",
    "address_postal_code": "Postal code",
    "address_country": "Country",
    "district": "District",
    "status": "Status",
    "status_override_value": "Status override",
    "status_override_reason": "Override reason",
    "is_tither": "Tither setting",
    "pays_contribution": "Contribution setting",
    "contribution_method": "Contribution method",
    "contribution_amount": "Contribution amount",
    "contribution_currency": "Contribution currency",
    "contribution_exception_reason": "Contribution exception",
    "notes": "Notes",
    "household_id": "Household assignment",
    "tags": "Tags",
    "ministries": "Ministries",
    "child_promoted": "Child promotion",
    "origin": "Origin",
    "deleted_at": "Archive status",
}


def _actor_name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.full_name or user.email or "Unknown"


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _field_label(field: str) -> str:
    return _FIELD_LABELS.get(field, field.replace("_", " ").strip().title())


def _audit_category(field: str) -> str:
    if field in _STATUS_FIELDS:
        return "Status"
    if field in _COMMUNITY_FIELDS:
        return "Community"
    return "Profile"


def _audit_title(entry: MemberAudit) -> str:
    label = _field_label(entry.field)
    if entry.field == "deleted_at":
        return "Member archived" if entry.new_value else "Member restored"
    if entry.field == "child_promoted":
        return "Child promoted to member"
    if entry.field == "origin":
        return "Member origin recorded"
    if entry.old_value is None and entry.new_value is not None:
        return f"{label} added"
    if entry.new_value is None:
        return f"{label} cleared"
    return f"{label} updated"


def _audit_detail(entry: MemberAudit) -> str | None:
    old_value = _clean(entry.old_value)
    new_value = _clean(entry.new_value)
    if entry.field == "deleted_at":
        return None
    if entry.field in {"child_promoted", "origin"}:
        return new_value or old_value
    if old_value and new_value:
        return f"{old_value} -> {new_value}"
    return new_value or old_value


def _payment_title(payment: Payment) -> str:
    service_label = payment.service_type.label if payment.service_type else "Payment"
    if payment.entry_kind == "Replacement":
        return f"{service_label} corrected entry posted"
    if payment.entry_kind == "Reversal":
        return f"{service_label} reversed"
    return f"{service_label} payment recorded"


def _payment_detail(payment: Payment) -> str | None:
    parts: list[str] = []
    if payment.method:
        parts.append(payment.method)
    if payment.status:
        parts.append(payment.status)
    if payment.correction_reason:
        parts.append(payment.correction_reason)
    elif payment.memo:
        parts.append(payment.memo)
    return " • ".join(parts) or None


def _payment_timestamp(payment: Payment) -> datetime:
    posted_at = payment.posted_at
    if posted_at.tzinfo is None:
        return posted_at.replace(tzinfo=timezone.utc)
    return posted_at.astimezone(timezone.utc)


def _contribution_timestamp(payment: MemberContributionPayment) -> datetime:
    return datetime.combine(payment.paid_at, datetime.min.time(), tzinfo=timezone.utc)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def list_member_timeline(db: Session, member_id: int, *, limit: int = 100) -> MemberTimelineResponse:
    member = (
        db.query(Member)
        .options(selectinload(Member.contribution_payments))
        .filter(Member.id == member_id, Member.deleted_at.is_(None))
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    audit_entries = (
        db.query(MemberAudit)
        .options(selectinload(MemberAudit.actor))
        .filter(MemberAudit.member_id == member.id)
        .order_by(MemberAudit.changed_at.desc())
        .all()
    )
    payments = (
        db.query(Payment)
        .options(
            selectinload(Payment.service_type),
            selectinload(Payment.recorded_by),
            selectinload(Payment.corrections),
        )
        .filter(Payment.member_id == member.id)
        .order_by(Payment.posted_at.desc(), Payment.id.desc())
        .all()
    )
    contribution_payments = (
        db.query(MemberContributionPayment)
        .options(selectinload(MemberContributionPayment.recorded_by))
        .filter(MemberContributionPayment.member_id == member.id)
        .order_by(MemberContributionPayment.paid_at.desc(), MemberContributionPayment.id.desc())
        .all()
    )

    health = refresh_membership_state(member, persist=False)
    membership_events = [
        event for event in build_membership_events(member, health)
        if event.type != "Renewal"
    ]

    items: list[MemberTimelineEvent] = []
    for entry in audit_entries:
        items.append(
            MemberTimelineEvent(
                id=f"audit-{entry.id}",
                category=_audit_category(entry.field),
                event_type="Audit",
                title=_audit_title(entry),
                detail=_audit_detail(entry),
                actor=_actor_name(entry.actor),
                occurred_at=_ensure_utc(entry.changed_at),
                reference_id=entry.id,
            )
        )

    for payment in payments:
        items.append(
            MemberTimelineEvent(
                id=f"payment-{payment.id}",
                category="Payment",
                event_type=payment.entry_kind,
                title=_payment_title(payment),
                detail=_payment_detail(payment),
                actor=_actor_name(payment.recorded_by),
                occurred_at=_payment_timestamp(payment),
                amount=Decimal(str(payment.amount)),
                currency=payment.currency,
                status=payment.status,
                reference_id=payment.id,
            )
        )

    for contribution in contribution_payments:
        detail_bits = [bit for bit in [contribution.method, contribution.note] if bit]
        items.append(
            MemberTimelineEvent(
                id=f"contribution-{contribution.id}",
                category="Contribution",
                event_type="Contribution",
                title="Contribution recorded",
                detail=" • ".join(detail_bits) or None,
                actor=_actor_name(contribution.recorded_by),
                occurred_at=_contribution_timestamp(contribution),
                amount=Decimal(str(contribution.amount)),
                currency=contribution.currency,
                status="Completed",
                reference_id=contribution.id,
            )
        )

    for index, event in enumerate(membership_events):
        items.append(
            MemberTimelineEvent(
                id=f"membership-{index}-{event.type.lower()}",
                category="Membership",
                event_type=event.type,
                title=event.label,
                detail=event.description,
                actor=None,
                occurred_at=_ensure_utc(event.timestamp),
            )
        )

    items.sort(key=lambda item: item.occurred_at, reverse=True)
    limited_items = items[:limit]
    return MemberTimelineResponse(items=limited_items, total=len(limited_items))
