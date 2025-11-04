from __future__ import annotations

from typing import Iterable, Optional

from slugify import slugify
from sqlalchemy import func
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
