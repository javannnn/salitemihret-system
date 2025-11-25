from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import exists
from sqlalchemy.orm import Session

from app.models.role import Role
from app.models.user import User

USERNAME_REGEX = re.compile(r"^[a-z0-9._]{4,32}$")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_username(value: str) -> str:
    base = value.lower()
    base = re.sub(r"[^a-z0-9._]", "", base)
    base = base.strip("._")
    if not base:
        base = f"user{secrets.randbelow(9999):04d}"
    return base[:32]


def ensure_valid_username(username: str) -> None:
    if not USERNAME_REGEX.fullmatch(username):
        raise ValueError("Usernames must be 4-32 characters and use only lowercase letters, numbers, dots, or underscores.")


def ensure_unique_username(db: Session, username: str, exclude_user_id: int | None = None) -> str:
    ensure_valid_username(username)
    base = username
    candidate = base
    suffix = 1
    while True:
        query = db.query(exists().where(User.username == candidate))
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if not query.scalar():
            return candidate
        candidate = f"{base}{suffix}"
        if len(candidate) > 32:
            trimmed = base[: max(0, 32 - len(str(suffix)))]
            candidate = f"{trimmed}{suffix}"
        suffix += 1


def generate_username_from_email(email: str, db: Session, exclude_user_id: int | None = None) -> str:
    local = email.split("@")[0]
    desired = sanitize_username(local)
    return ensure_unique_username(db, desired, exclude_user_id=exclude_user_id)


SPECIAL_CHARACTERS = set("!@#$%^&*()_+-={}[]:\";'<>?,./\\")


def validate_password_strength(password: str) -> None:
    if len(password) < 12:
        raise ValueError("Password must be at least 12 characters long.")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must include at least one uppercase letter.")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must include at least one lowercase letter.")
    if not re.search(r"[0-9]", password):
        raise ValueError("Password must include at least one digit.")
    if not any(char in SPECIAL_CHARACTERS for char in password):
        raise ValueError("Password must include at least one symbol.")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def load_roles(db: Session, role_names: Iterable[str]) -> list[Role]:
    roles = list(db.query(Role).filter(Role.name.in_(list(role_names))).all())
    missing = set(role_names) - {role.name for role in roles}
    if missing:
        raise ValueError(f"Roles not found: {', '.join(sorted(missing))}")
    return roles
