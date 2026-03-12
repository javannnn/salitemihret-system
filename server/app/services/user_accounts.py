from __future__ import annotations

import base64
import hashlib
import logging
import re
import random
import secrets
from datetime import datetime, timezone
from typing import Iterable

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.role import Role
from app.models.user import User

USERNAME_REGEX = re.compile(r"^[a-z0-9._]{4,32}$")
logger = logging.getLogger(__name__)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def sanitize_username(value: str) -> str:
    base = value.lower()
    base = re.sub(r"[^a-z0-9._]", "", base)
    base = base.strip("._")
    if not base:
        base = f"user{secrets.randbelow(9999):04d}"
    elif len(base) < 4:
        # Preserve short email locals like "cto" while guaranteeing a valid username length.
        base = f"user.{base}"
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
        query = db.query(User.id).filter(User.username == candidate)
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if query.first() is None:
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
TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"
TEMP_PASSWORD_LOWER = "abcdefghijkmnopqrstuvwxyz"
TEMP_PASSWORD_DIGITS = "23456789"
TEMP_PASSWORD_SYMBOLS = "!@#$%^&*"


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


def generate_temporary_password(length: int = 16) -> str:
    if length < 12:
        raise ValueError("Temporary passwords must be at least 12 characters long.")
    chooser = secrets.choice
    alphabet = TEMP_PASSWORD_UPPER + TEMP_PASSWORD_LOWER + TEMP_PASSWORD_DIGITS + TEMP_PASSWORD_SYMBOLS
    chars = [
        chooser(TEMP_PASSWORD_UPPER),
        chooser(TEMP_PASSWORD_LOWER),
        chooser(TEMP_PASSWORD_DIGITS),
        chooser(TEMP_PASSWORD_SYMBOLS),
    ]
    chars.extend(chooser(alphabet) for _ in range(length - len(chars)))
    random.SystemRandom().shuffle(chars)
    return "".join(chars)


def _temporary_password_cipher() -> Fernet:
    secret = settings.TEMP_CREDENTIALS_SECRET or settings.JWT_SECRET
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def store_temporary_password(user: User, password: str) -> None:
    user.temporary_password_encrypted = _temporary_password_cipher().encrypt(password.encode("utf-8")).decode("utf-8")
    user.temporary_password_issued_at = now_utc()
    user.must_change_password = True


def clear_temporary_password(user: User) -> None:
    user.temporary_password_encrypted = None
    user.temporary_password_issued_at = None


def get_temporary_password(user: User) -> str | None:
    if not user.temporary_password_encrypted:
        return None
    try:
        return _temporary_password_cipher().decrypt(user.temporary_password_encrypted.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning("temporary_password_decrypt_failed", extra={"user_id": user.id})
        return None


def has_active_temporary_password(user: User) -> bool:
    return bool(user.must_change_password and (user.temporary_password_encrypted or user.temporary_password_issued_at))


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def load_roles(db: Session, role_names: Iterable[str]) -> list[Role]:
    roles = list(db.query(Role).filter(Role.name.in_(list(role_names))).all())
    missing = set(role_names) - {role.name for role in roles}
    if missing:
        raise ValueError(f"Roles not found: {', '.join(sorted(missing))}")
    return roles
