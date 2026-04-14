from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import and_, or_

from app.models.user import User

UserLifecycleStatus = Literal["active", "inactive", "suspended", "deleted"]


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def user_is_deleted(user: User) -> bool:
    return user.deleted_at is not None


def user_is_suspended(user: User, *, now: datetime | None = None) -> bool:
    suspended_until = _as_utc(user.suspended_until)
    if suspended_until is None:
        return False
    return suspended_until > (now or now_utc())


def get_user_lifecycle_status(user: User, *, now: datetime | None = None) -> UserLifecycleStatus:
    reference = now or now_utc()
    if user_is_deleted(user):
        return "deleted"
    if user_is_suspended(user, now=reference):
        return "suspended"
    if not user.is_active:
        return "inactive"
    return "active"


def can_user_sign_in(user: User, *, now: datetime | None = None) -> bool:
    return get_user_lifecycle_status(user, now=now) == "active"


def format_lifecycle_datetime(value: datetime | None) -> str | None:
    normalized = _as_utc(value)
    if normalized is None:
        return None
    return normalized.strftime("%Y-%m-%d %H:%M UTC")


def get_user_auth_block_reason(user: User, *, now: datetime | None = None) -> str | None:
    reference = now or now_utc()
    if user_is_deleted(user):
        return "This account has been deleted. Contact an administrator to restore it."
    if user_is_suspended(user, now=reference):
        until = format_lifecycle_datetime(user.suspended_until) or "a later time"
        return f"This account is suspended until {until}. Contact an administrator if you need access sooner."
    if not user.is_active:
        return "This account is inactive. Contact an administrator to reactivate it."
    return None


def active_user_sql_clause(*, now: datetime | None = None):
    reference = now or now_utc()
    return and_(
        User.is_active.is_(True),
        User.deleted_at.is_(None),
        or_(User.suspended_until.is_(None), User.suspended_until <= reference),
    )


def inactive_user_sql_clause(*, now: datetime | None = None):
    reference = now or now_utc()
    return and_(
        User.deleted_at.is_(None),
        User.is_active.is_(False),
        or_(User.suspended_until.is_(None), User.suspended_until <= reference),
    )


def suspended_user_sql_clause(*, now: datetime | None = None):
    reference = now or now_utc()
    return and_(User.deleted_at.is_(None), User.suspended_until.is_not(None), User.suspended_until > reference)


def deleted_user_sql_clause():
    return User.deleted_at.is_not(None)
