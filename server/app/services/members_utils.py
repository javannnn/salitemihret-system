from __future__ import annotations

from typing import Iterable, Optional, Sequence

from slugify import slugify
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.household import Household
from app.models.member import Child, Member, Spouse
from app.models.priest import Priest


def generate_username(db: Session, first_name: str, last_name: str) -> str:
    base = slugify(f"{first_name}.{last_name}", separator=".")
    candidate = base
    suffix = 1
    while db.query(Member).filter(Member.username == candidate).first():
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def ensure_household(db: Session, name: str) -> Household:
    """Fetch or create a household by name (case-insensitive)."""

    cleaned = name.strip()
    if not cleaned:
        raise ValueError("Household name cannot be empty")

    existing = (
        db.query(Household)
        .filter(func.lower(Household.name) == cleaned.lower())
        .first()
    )
    if existing:
        return existing

    household = Household(name=cleaned)
    db.add(household)
    db.flush()
    return household


def ensure_priest(db: Session, full_name: str) -> Priest:
    cleaned = full_name.strip()
    if not cleaned:
        raise ValueError("Priest name cannot be empty")

    existing = (
        db.query(Priest)
        .filter(func.lower(Priest.full_name) == cleaned.lower())
        .first()
    )
    if existing:
        return existing

    priest = Priest(full_name=cleaned)
    db.add(priest)
    db.flush()
    return priest


def _compose_name(first_name: str, last_name: str) -> str:
    return " ".join(part for part in [first_name.strip(), last_name.strip()] if part)


def apply_spouse(member: Member, payload: Optional[dict]) -> None:
    """Create or update the spouse record based on payload."""

    if not payload:
        member.spouse = None
        return

    first_name = payload["first_name"].strip()
    last_name = payload["last_name"].strip()
    full_name = _compose_name(first_name, last_name)

    if member.spouse is None:
        spouse = Spouse(
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            gender=payload.get("gender"),
            country_of_birth=payload.get("country_of_birth"),
            phone=payload.get("phone"),
            email=payload.get("email"),
        )
        member.spouse = spouse
    else:
        spouse = member.spouse
        spouse.first_name = first_name
        spouse.last_name = last_name
        spouse.full_name = full_name
        spouse.gender = payload.get("gender")
        spouse.country_of_birth = payload.get("country_of_birth")
        spouse.phone = payload.get("phone")
        spouse.email = payload.get("email")


def apply_children(member: Member, children_payload: Optional[Iterable[dict]]) -> None:
    """Replace the member's children with the supplied payload list."""

    if children_payload is None:
        return

    member.children_all.clear()
    for child_data in children_payload:
        first_name = child_data["first_name"].strip()
        last_name = child_data["last_name"].strip()
        full_name = _compose_name(first_name, last_name)
        child = Child(
            first_name=first_name,
            last_name=last_name,
            full_name=full_name,
            gender=child_data.get("gender"),
            country_of_birth=child_data.get("country_of_birth"),
            birth_date=child_data.get("birth_date"),
            notes=child_data.get("notes"),
        )
        member.children_all.append(child)


def find_member_duplicates(
    db: Session,
    *,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    exclude_member_id: Optional[int] = None,
    limit: int = 5,
) -> list[tuple[Member, list[str]]]:
    """Return potential duplicates with the reason(s) they matched."""

    email_lower = email.lower().strip() if email else None
    first_lower = first_name.lower().strip() if first_name else None
    last_lower = last_name.lower().strip() if last_name else None
    phone_normalized = phone.strip() if phone else None

    has_name_clause = bool(first_lower and last_lower)
    name_clause = None
    if has_name_clause:
        name_clause = func.lower(Member.first_name) == first_lower
        name_clause = name_clause & (func.lower(Member.last_name) == last_lower)

    if not any([bool(email_lower), bool(phone_normalized), has_name_clause]):
        return []

    query = db.query(Member).filter(Member.deleted_at.is_(None))
    if exclude_member_id:
        query = query.filter(Member.id != exclude_member_id)

    # combine email/phone OR, but names require both first and last match
    or_clauses: list = []
    if email_lower:
        or_clauses.append(func.lower(Member.email) == email_lower)
    if phone_normalized:
        or_clauses.append(Member.phone == phone_normalized)
    if has_name_clause and name_clause is not None:
        or_clauses.append(name_clause)
    query = query.filter(or_(*or_clauses))

    matches: list[tuple[Member, list[str]]] = []
    for candidate in query.limit(limit * 2).all():
        reasons: list[str] = []
        if email_lower and candidate.email and candidate.email.lower() == email_lower:
            reasons.append("email")
        if phone_normalized and candidate.phone == phone_normalized:
            reasons.append("phone")
        if first_lower and last_lower:
            if (
                candidate.first_name
                and candidate.first_name.lower().strip() == first_lower
                and candidate.last_name
                and candidate.last_name.lower().strip() == last_lower
            ):
                reasons.append("name")
        if reasons:
            matches.append((candidate, reasons))
        if len(matches) >= limit:
            break
    return matches


def cleanup_archived_members(db: Session) -> int:
    """Permanently delete members archived more than 5 years ago."""
    from datetime import datetime, timedelta

    cutoff_date = datetime.utcnow() - timedelta(days=5 * 365)
    
    # Find members to delete
    members_to_delete = (
        db.query(Member)
        .filter(Member.deleted_at.isnot(None))
        .filter(Member.deleted_at < cutoff_date)
        .all()
    )
    
    count = len(members_to_delete)
    if count > 0:
        for member in members_to_delete:
            db.delete(member)
        db.commit()
        
    return count
