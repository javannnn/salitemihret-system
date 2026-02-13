from __future__ import annotations

from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.member import Member
from app.models.member_audit import MemberAudit

_TRACKED_FIELDS = {
    "first_name",
    "middle_name",
    "last_name",
    "email",
    "phone",
    "birth_date",
    "join_date",
    "gender",
    "baptismal_name",
    "marital_status",
    "address",
    "address_street",
    "address_city",
    "address_region",
    "address_postal_code",
    "address_country",
    "district",
    "status",
    "is_tither",
    "pays_contribution",
    "contribution_method",
    "contribution_amount",
    "contribution_currency",
    "contribution_exception_reason",
    "contribution_exception_attachment_path",
    "notes",
    "avatar_path",
    "household_id",
    "household_size_override",
    "has_father_confessor",
    "father_confessor_id",
    "deleted_at",
}


def snapshot_member(member: Member) -> Dict[str, Any]:
    """Create a snapshot of tracked fields for comparison."""

    data: Dict[str, Any] = {field: getattr(member, field) for field in _TRACKED_FIELDS}
    data["tags"] = ",".join(sorted(tag.slug for tag in member.tags))
    data["ministries"] = ",".join(sorted(ministry.slug for ministry in member.ministries))
    return data


def empty_member_snapshot() -> Dict[str, Any]:
    """Return an empty snapshot useful for inserts."""

    data: Dict[str, Any] = {field: None for field in _TRACKED_FIELDS}
    data["tags"] = None
    data["ministries"] = None
    return data


def _to_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (str, int, float)):
        return str(value)
    return str(value)


def record_member_changes(db: Session, member: Member, previous_snapshot: Dict[str, Any], actor_id: int | None) -> None:
    """Persist audit entries for fields that changed."""

    current_snapshot = snapshot_member(member)

    for field, old_value in previous_snapshot.items():
        if field in {"tags", "ministries"}:
            continue
        new_value = current_snapshot.get(field)
        if old_value == new_value:
            continue

        audit = MemberAudit(
            member_id=member.id,
            field=field,
            old_value=_to_string(old_value),
            new_value=_to_string(new_value),
            changed_by_id=actor_id,
        )
        db.add(audit)

    for relation_field in ("tags", "ministries"):
        old_value = previous_snapshot.get(relation_field)
        new_value = current_snapshot.get(relation_field)
        if old_value == new_value:
            continue
        audit = MemberAudit(
            member_id=member.id,
            field=relation_field,
            old_value=_to_string(old_value),
            new_value=_to_string(new_value),
            changed_by_id=actor_id,
        )
        db.add(audit)
