from __future__ import annotations

from slugify import slugify
from sqlalchemy.orm import Session

from app.models.member import Member


def generate_username(db: Session, first_name: str, last_name: str) -> str:
    base = slugify(f"{first_name}.{last_name}", separator=".")
    candidate = base
    suffix = 1
    while db.query(Member).filter(Member.username == candidate).first():
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate
