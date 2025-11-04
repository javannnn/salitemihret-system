from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable, List

from sqlalchemy.orm import Session, selectinload

from app.models.member import Child, Member
from app.models.member_audit import MemberAudit
from app.services.members_utils import generate_username
from app.services.notifications import notify_child_turns_eighteen


def _add_years(src: date, years: int) -> date:
    """Add `years` to `src`, handling leap years."""

    try:
        return src.replace(year=src.year + years)
    except ValueError:
        # Handle February 29th by falling back to February 28th
        return src.replace(month=2, day=28, year=src.year + years)


def _turns_eighteen_on(birth_date: date) -> date:
    return _add_years(birth_date, 18)


def get_children_ready_for_promotion(db: Session, within_days: int = 0) -> List[tuple[Child, date]]:
    """Return children (and their 18th birthday) within the provided window."""

    today = date.today()
    limit = today + timedelta(days=within_days)
    query = (
        db.query(Child)
        .options(selectinload(Child.parent).selectinload(Member.household))
        .filter(Child.promoted_at.is_(None), Child.birth_date.isnot(None))
    )

    results: List[tuple[Child, date]] = []
    for child in query.all():
        turns_on = _turns_eighteen_on(child.birth_date)  # type: ignore[arg-type]
        if turns_on <= limit:
            results.append((child, turns_on))
    results.sort(key=lambda item: item[1])
    return results


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return "New", "Member"
    if len(parts) == 1:
        return parts[0], "Member"
    return parts[0], " ".join(parts[1:])


def promote_child(
    db: Session,
    *,
    child: Child,
    actor_id: int | None = None,
    pending_status: str = "Pending",
) -> Member:
    if child.promoted_at is not None:
        raise ValueError("Child already promoted")

    parent = child.parent
    first_name = child.first_name or _split_name(child.full_name)[0]
    last_name = child.last_name or _split_name(child.full_name)[1]
    username = generate_username(db, first_name, last_name)

    new_member = Member(
        first_name=first_name,
        middle_name=None,
        last_name=last_name,
        username=username,
        email=None,
        phone=None,
        birth_date=child.birth_date,
        join_date=date.today(),
        gender=child.gender,
        address=None,
        address_street=None,
        address_city=None,
        address_region=None,
        address_postal_code=None,
        address_country=None,
        district=parent.district if parent else None,
        status=pending_status,
        is_tither=False,
        pays_contribution=False,
        contribution_method=None,
        contribution_amount=None,
        notes=f"Promoted from child of member #{parent.id}" if parent else "Promoted from child record",
        created_by_id=actor_id,
        updated_by_id=actor_id,
    )
    if parent and parent.household_id:
        new_member.household_id = parent.household_id

    db.add(new_member)
    db.flush()

    child.promoted_at = datetime.utcnow()

    if parent:
        audit_parent = MemberAudit(
            member_id=parent.id,
            field="child_promoted",
            old_value=child.full_name,
            new_value=f"Promoted to member #{new_member.id}",
            changed_by_id=actor_id,
        )
        db.add(audit_parent)

    audit_child = MemberAudit(
        member_id=new_member.id,
        field="origin",
        old_value=None,
        new_value=f"Promoted from child record (parent #{parent.id if parent else 'n/a'})",
        changed_by_id=actor_id,
    )
    db.add(audit_child)

    notify_child_turns_eighteen(child, parent, new_member)
    return new_member


def promote_children_who_are_18(db: Session, actor_id: int | None = None) -> List[tuple[Child, Member]]:
    """Promote eligible children to members and return the transitions."""

    today = date.today()
    transitions: List[tuple[Child, Member]] = []
    for child, turns_on in get_children_ready_for_promotion(db, within_days=0):
        if turns_on > today:
            continue
        new_member = promote_child(db, child=child, actor_id=actor_id)
        transitions.append((child, new_member))

    return transitions
