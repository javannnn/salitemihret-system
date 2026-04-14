from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.user import User
from app.services.permissions import (
    PermissionAction,
    forbidden_write_fields,
    has_any_custom_role,
    has_field_permission,
    has_module_permission,
    infer_permission_target,
)
from app.services.user_lifecycle import get_user_auth_block_reason

bearer_scheme = HTTPBearer(auto_error=False)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _enforce_session_activity(db: Session, user: User) -> None:
    now = datetime.now(timezone.utc)
    last_seen = _as_utc(user.last_seen)
    idle_timeout = timedelta(minutes=settings.SESSION_IDLE_TIMEOUT_MINUTES)

    if last_seen is not None and now - last_seen >= idle_timeout:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired due to inactivity",
        )

    update_interval = timedelta(seconds=settings.SESSION_ACTIVITY_UPDATE_INTERVAL_SECONDS)
    if last_seen is None or now - last_seen >= update_interval:
        user.last_seen = now
        db.commit()


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user: User | None = None
    try:
        user = db.get(User, int(subject))
    except (TypeError, ValueError):
        user = None

    if user is None:
        user = db.query(User).filter(User.email == str(subject)).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")

    block_reason = get_user_auth_block_reason(user)
    if block_reason:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=block_reason)

    _enforce_session_activity(db, user)

    if user.must_change_password:
        allowed_paths = {"/auth/whoami", "/account/me", "/account/me/password", "/license/status"}
        if request.url.path not in allowed_paths:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required before accessing other features",
            )
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    async def checker(
        request: Request,
        user: User = Depends(get_current_user),
    ) -> User:
        if user.is_super_admin:
            return user

        user_roles = {role.name for role in user.roles}
        matched_requested_role = any(role in user_roles for role in roles)
        module, action = infer_permission_target(request.method, request.url.path)

        if matched_requested_role:
            if module and not has_module_permission(user, module, action):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Module access denied")
        else:
            # Legacy built-in roles still require explicit allow-lists.
            # Custom roles can pass by configured module permissions.
            if not module or not has_any_custom_role(user) or not has_module_permission(user, module, action):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

        if module and action == "write":
            content_type = (request.headers.get("content-type") or "").lower()
            if "application/json" in content_type:
                try:
                    body = await request.json()
                except Exception:
                    body = None
                if isinstance(body, dict):
                    blocked = forbidden_write_fields(user, module, body.keys())
                    if blocked:
                        detail = f"Field write access denied for: {', '.join(blocked)}"
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

        return user

    return checker


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin privileges required")
    return user


def require_field_permission(module: str, field: str, action: PermissionAction) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if not has_field_permission(user, module, field, action):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Field access denied")
        return user

    return checker


def get_current_active_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Compatibility wrapper for routes that expect an "active" user dependency.
    """
    return get_current_user(request=request, credentials=credentials, db=db)
