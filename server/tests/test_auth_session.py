from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt
from starlette.requests import Request

from app.auth.deps import get_current_user
from app.auth.security import create_access_token
from app.core.config import settings
from app.models.user import User
from app.routers.chat import heartbeat
from conftest import TestingSessionLocal


def _create_user(
    *,
    email: str,
    username: str,
    last_seen: datetime | None = None,
) -> int:
    with TestingSessionLocal() as db_session:
        user = User(
            email=email,
            username=username,
            full_name="Session Test User",
            hashed_password="not-used-in-session-tests",
            is_active=True,
            last_login_at=last_seen,
            last_seen=last_seen,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user.id


def _make_request(path: str = "/auth/whoami") -> Request:
    return Request(
        {
            "type": "http",
            "path": path,
            "headers": [],
            "query_string": b"",
            "method": "GET",
        }
    )


def test_access_token_uses_four_hour_expiry(monkeypatch):
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 240)

    started_at = datetime.now(timezone.utc)
    token = create_access_token(subject="123", roles=["Admin"])
    finished_at = datetime.now(timezone.utc)

    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)

    assert started_at + timedelta(minutes=239, seconds=50) <= expires_at
    assert expires_at <= finished_at + timedelta(minutes=240, seconds=5)


def test_whoami_rejects_idle_session_after_thirty_minutes(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_IDLE_TIMEOUT_MINUTES", 30)
    last_seen = datetime.now(timezone.utc) - timedelta(minutes=31)
    user_id = _create_user(
        email="idle-expired@example.com",
        username="idle.expired",
        last_seen=last_seen,
    )
    token = create_access_token(subject=str(user_id), roles=[])

    with TestingSessionLocal() as db_session:
        with pytest.raises(HTTPException) as exc_info:
            get_current_user(
                request=_make_request(),
                credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
                db=db_session,
            )

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Session expired due to inactivity"


def test_whoami_refreshes_last_seen_for_active_session(monkeypatch):
    monkeypatch.setattr(settings, "SESSION_IDLE_TIMEOUT_MINUTES", 30)
    monkeypatch.setattr(settings, "SESSION_ACTIVITY_UPDATE_INTERVAL_SECONDS", 60)
    previous_last_seen = datetime.now(timezone.utc) - timedelta(minutes=5)
    user_id = _create_user(
        email="active-session@example.com",
        username="active.session",
        last_seen=previous_last_seen,
    )
    token = create_access_token(subject=str(user_id), roles=[])

    with TestingSessionLocal() as db_session:
        user = get_current_user(
            request=_make_request(),
            credentials=HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
            db=db_session,
        )
        assert user.id == user_id

    with TestingSessionLocal() as db_session:
        user = db_session.get(User, user_id)
        assert user is not None
        assert user.last_seen is not None
        refreshed_last_seen = user.last_seen
    if refreshed_last_seen.tzinfo is None:
        refreshed_last_seen = refreshed_last_seen.replace(tzinfo=timezone.utc)
    assert refreshed_last_seen > previous_last_seen


def test_chat_heartbeat_writes_timezone_aware_last_seen():
    user_id = _create_user(
        email="heartbeat-session@example.com",
        username="heartbeat.session",
        last_seen=datetime.now(timezone.utc) - timedelta(minutes=5),
    )

    with TestingSessionLocal() as db_session:
        user = db_session.get(User, user_id)
        assert user is not None

        heartbeat(db=db_session, current_user=user)

        assert user.last_seen is not None
        assert user.last_seen.tzinfo is not None
        assert user.last_seen.utcoffset() == timedelta(0)
