from __future__ import annotations

import logging
import secrets
from datetime import timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import require_super_admin
from app.auth.security import hash_password
from app.core.config import settings
from app.core.db import get_db
from app.models.member import Member
from app.models.role import Role
from app.models.user import (
    User,
    UserMemberLink,
    UserInvitation,
    UserAuditLog,
    UserAuditActionEnum,
)
from app.schemas.user_admin import (
    EmailDeliveryDetails,
    InvitationCreateRequest,
    InvitationResponse,
    UserAdminDetailResponse,
    UserProvisionRequest,
    UserProvisionResponse,
    UserPasswordResetResponse,
    UserAdminSummary,
    UserAuditEntry,
    UserListResponse,
    UserMemberLinkRequest,
    UserRolesUpdateRequest,
    UserUpdateRequest,
    UserDeleteRequest,
    UserMemberSummary,
    UserSuspendRequest,
    UserTemporaryCredentials,
)
from app.services.user_accounts import (
    clear_temporary_password,
    ensure_unique_username,
    generate_temporary_password,
    generate_username_from_email,
    get_temporary_password,
    hash_token,
    has_active_temporary_password,
    load_roles,
    now_utc,
    store_temporary_password,
)
from app.services.notifications import (
    build_email_delivery_details,
    send_admin_password_reset_email,
    send_provisioned_account_email,
    send_user_invitation_email,
)
from app.services.user_lifecycle import (
    active_user_sql_clause,
    can_user_sign_in,
    deleted_user_sql_clause,
    get_user_lifecycle_status,
    inactive_user_sql_clause,
    suspended_user_sql_clause,
    user_is_suspended,
)

router = APIRouter(prefix="/users", tags=["users"])
SUPER_ADMIN_ROLE_NAME = "SuperAdmin"
logger = logging.getLogger(__name__)


def _enum_value(value: Any) -> Any:
    if value is None:
        return None
    return value.value if hasattr(value, "value") else value


def _serialize_member(link: UserMemberLink | None, owning_user: User | None = None) -> UserMemberSummary | None:
    if not link or not link.member:
        return None
    member = link.member
    linked_user_id = owning_user.id if owning_user else link.user_id
    linked_username = owning_user.username if owning_user else getattr(link.user, "username", None)
    return UserMemberSummary(
        id=member.id,
        first_name=member.first_name,
        last_name=member.last_name,
        username=member.username,
        status=_enum_value(member.status),
        email=member.email,
        phone=member.phone,
        linked_user_id=linked_user_id,
        linked_username=linked_username,
    )


def _serialize_user(user: User) -> UserAdminSummary:
    role_names = [role.name for role in user.roles]
    if user.is_super_admin:
        role_names = [SUPER_ADMIN_ROLE_NAME]
    lifecycle_status = get_user_lifecycle_status(user)
    return UserAdminSummary(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        lifecycle_status=lifecycle_status,
        can_sign_in=can_user_sign_in(user),
        suspended_until=user.suspended_until,
        suspension_reason=user.suspension_reason,
        deleted_at=user.deleted_at,
        deletion_reason=user.deletion_reason,
        must_change_password=user.must_change_password,
        roles=role_names,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        member=_serialize_member(user.member_link, owning_user=user),
    )


def _serialize_user_detail(user: User) -> UserAdminDetailResponse:
    summary = _serialize_user(user)
    temporary_credentials = None
    if has_active_temporary_password(user):
        temporary_credentials = UserTemporaryCredentials(
            password=get_temporary_password(user),
            issued_at=user.temporary_password_issued_at,
            is_active=True,
        )
    return UserAdminDetailResponse(
        **summary.model_dump(),
        temporary_credentials=temporary_credentials,
    )


def _log_audit(
    db: Session,
    *,
    actor: User,
    target: User,
    action: UserAuditActionEnum,
    payload: dict[str, Any] | None = None,
) -> None:
    entry = UserAuditLog(
        actor_user_id=actor.id,
        action=action,
        target_user_id=target.id,
        payload=payload or {},
        created_at=now_utc(),
    )
    db.add(entry)


def _load_user(db: Session, user_id: int) -> User:
    user = (
        db.query(User)
        .options(
            joinedload(User.roles),
            joinedload(User.member_link).joinedload(UserMemberLink.member),
        )
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def _ensure_member_available(db: Session, member_id: int, *, current_user_id: int | None = None) -> Member:
    member = db.get(Member, member_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member not found")
    existing_link = (
        db.query(UserMemberLink)
        .filter(UserMemberLink.member_id == member_id)
        .first()
    )
    if existing_link and existing_link.user_id != current_user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already linked to another user")
    return member


def _normalize_unique_email(
    db: Session,
    email: str,
    *,
    exclude_user_id: int | None = None,
) -> str:
    normalized = email.strip().lower()
    existing_query = db.query(User).filter(func.lower(User.email) == normalized)
    if exclude_user_id is not None:
        existing_query = existing_query.filter(User.id != exclude_user_id)
    existing_user = existing_query.first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with that email already exists",
        )
    return normalized


def _ensure_user_not_deleted(user: User, *, action_label: str) -> None:
    if user.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Restore the user before attempting to {action_label}.",
        )


def _count_other_sign_in_ready_super_admins(db: Session, *, exclude_user_id: int) -> int:
    return (
        db.query(func.count(User.id))
        .filter(
            User.id != exclude_user_id,
            User.is_super_admin.is_(True),
            active_user_sql_clause(),
        )
        .scalar()
        or 0
    )


def _guard_admin_access_loss(
    db: Session,
    *,
    actor: User,
    target: User,
    future_is_super_admin: bool,
    future_can_sign_in: bool,
) -> None:
    if actor.id == target.id and (not future_is_super_admin or not future_can_sign_in):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove your own admin access from this screen.",
        )

    if target.is_super_admin and can_user_sign_in(target) and (not future_is_super_admin or not future_can_sign_in):
        if _count_other_sign_in_ready_super_admins(db, exclude_user_id=target.id) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one sign-in-ready super admin must remain.",
            )


@router.get("", response_model=UserListResponse)
def list_users(
    search: str | None = Query(default=None, description="Search email, username, or name"),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    lifecycle_status: Literal["active", "inactive", "suspended", "deleted"] | None = Query(default=None),
    linked: bool | None = Query(default=None, description="Filter by member link status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserListResponse:
    query = (
        db.query(User)
        .options(
            joinedload(User.roles),
            joinedload(User.member_link).joinedload(UserMemberLink.member),
        )
    )
    if search:
        pattern = f"%{search.lower()}%"
        query = query.filter(
            or_(
                func.lower(User.email).like(pattern),
                func.lower(User.username).like(pattern),
                func.lower(func.coalesce(User.full_name, "")).like(pattern),
            )
        )
    if role:
        query = query.join(User.roles).filter(Role.name == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if lifecycle_status == "active":
        query = query.filter(active_user_sql_clause())
    elif lifecycle_status == "inactive":
        query = query.filter(inactive_user_sql_clause())
    elif lifecycle_status == "suspended":
        query = query.filter(suspended_user_sql_clause())
    elif lifecycle_status == "deleted":
        query = query.filter(deleted_user_sql_clause())
    if linked is not None:
        query = query.outerjoin(User.member_link)
        if linked:
            query = query.filter(UserMemberLink.member_id.isnot(None))
        else:
            query = query.filter(UserMemberLink.id.is_(None) | UserMemberLink.member_id.is_(None))

    total = query.distinct().count()
    users = (
        query.order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_active = db.query(func.count(User.id)).filter(active_user_sql_clause()).scalar() or 0
    total_inactive = db.query(func.count(User.id)).filter(inactive_user_sql_clause()).scalar() or 0
    total_suspended = db.query(func.count(User.id)).filter(suspended_user_sql_clause()).scalar() or 0
    total_deleted = db.query(func.count(User.id)).filter(deleted_user_sql_clause()).scalar() or 0
    total_linked = (
        db.query(func.count(User.id))
        .join(User.member_link)
        .filter(UserMemberLink.member_id.isnot(None))
        .scalar()
        or 0
    )
    total_unlinked = max(total_users - total_linked, 0)
    return UserListResponse(
        items=[_serialize_user(user) for user in users],
        total=total,
        limit=limit,
        offset=offset,
        total_active=total_active,
        total_inactive=total_inactive,
        total_suspended=total_suspended,
        total_deleted=total_deleted,
        total_linked=total_linked,
        total_unlinked=total_unlinked,
    )


@router.get("/member-search", response_model=list[UserMemberSummary])
def search_members(
    query: str = Query(..., min_length=2, description="Search by member name, email, or phone"),
    limit: int = Query(default=8, ge=1, le=50),
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> list[UserMemberSummary]:
    pattern = f"%{query.lower()}%"
    members = (
        db.query(Member)
        .options(joinedload(Member.user_link).joinedload(UserMemberLink.user))
        .filter(
            or_(
                func.lower(Member.first_name).like(pattern),
                func.lower(Member.last_name).like(pattern),
                func.lower(func.coalesce(Member.email, "")).like(pattern),
                func.lower(func.coalesce(Member.phone, "")).like(pattern),
            )
        )
        .order_by(Member.first_name.asc(), Member.last_name.asc())
        .limit(limit)
        .all()
    )
    results: list[UserMemberSummary] = []
    for member in members:
        results.append(
            UserMemberSummary(
                id=member.id,
                first_name=member.first_name,
                last_name=member.last_name,
                username=member.username,
                status=_enum_value(member.status),
                email=member.email,
                phone=member.phone,
                linked_user_id=member.user_link.user_id if member.user_link else None,
                linked_username=member.user_link.user.username if member.user_link and member.user_link.user else None,
            )
        )
    return results


@router.post("", response_model=UserProvisionResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserProvisionRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserProvisionResponse:
    email = _normalize_unique_email(db, str(payload.email))

    username = payload.username
    if username:
        try:
            clean_username = ensure_unique_username(db, username)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    else:
        try:
            clean_username = generate_username_from_email(email, db)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    member: Member | None = None
    if payload.member_id is not None:
        member = _ensure_member_available(db, payload.member_id)

    try:
        super_requested = SUPER_ADMIN_ROLE_NAME in payload.roles
        filtered_roles = [] if super_requested else [role for role in payload.roles if role != SUPER_ADMIN_ROLE_NAME]
        roles = load_roles(db, filtered_roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    temporary_password = generate_temporary_password()
    user = User(
        email=email,
        username=clean_username,
        full_name=payload.full_name.strip() if payload.full_name else None,
        hashed_password=hash_password(temporary_password),
        is_active=True,
        is_super_admin=super_requested,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    store_temporary_password(user, temporary_password)
    user.roles = roles
    db.add(user)
    try:
        db.flush()
        if member is not None:
            user.member_link = UserMemberLink(
                member_id=member.id,
                linked_by_user_id=actor.id,
                linked_at=now_utc(),
                notes="Linked during account provisioning",
            )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to create user. Check email, username, and member link uniqueness.",
        ) from exc
    db.refresh(user)

    email_sent = False
    try:
        email_sent = send_provisioned_account_email(
            user=user,
            temporary_password=temporary_password,
            created_by=actor,
            message=payload.message,
        )
    except Exception:
        logger.exception(
            "provisioned_account_email_failed",
            extra={"user_id": user.id, "email": user.email, "actor_id": actor.id},
        )
    email_delivery_payload = build_email_delivery_details(recipient=user.email, accepted=email_sent)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.USER_CREATED,
        payload={
            "direct_provision": True,
            "email_sent": email_sent,
            "email_delivery": email_delivery_payload,
            "must_change_password": True,
        },
    )
    if member is not None:
        _log_audit(
            db,
            actor=actor,
            target=user,
            action=UserAuditActionEnum.MEMBER_LINKED,
            payload={"member_id": member.id},
        )
    db.commit()

    return UserProvisionResponse(
        user=_serialize_user(_load_user(db, user.id)),
        temporary_password=temporary_password,
        email_sent=email_sent,
        email_delivery=EmailDeliveryDetails(**email_delivery_payload),
    )


@router.get("/{user_id}", response_model=UserAdminDetailResponse)
def get_user_detail(
    user_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminDetailResponse:
    user = _load_user(db, user_id)
    return _serialize_user_detail(user)


@router.patch("/{user_id}", response_model=UserAdminSummary)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="edit this account")
    changes: dict[str, Any] = {}
    future_is_active = payload.is_active if payload.is_active is not None else user.is_active
    future_is_super_admin = payload.is_super_admin if payload.is_super_admin is not None else user.is_super_admin
    future_can_sign_in = future_is_active and not user_is_suspended(user)
    _guard_admin_access_loss(
        db,
        actor=actor,
        target=user,
        future_is_super_admin=future_is_super_admin,
        future_can_sign_in=future_can_sign_in,
    )
    if payload.email is not None:
        new_email = _normalize_unique_email(db, str(payload.email), exclude_user_id=user.id)
        if new_email != user.email:
            user.email = new_email
            changes["email"] = new_email
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changes["is_active"] = payload.is_active
    if payload.is_super_admin is not None:
        user.is_super_admin = payload.is_super_admin
        if payload.is_super_admin:
            user.roles = []
        changes["is_super_admin"] = payload.is_super_admin
    if payload.username is not None:
        desired = payload.username
        try:
            new_username = ensure_unique_username(db, desired, exclude_user_id=user.id)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if new_username != user.username:
            user.username = new_username
            user.username_changed_at = now_utc()
            changes["username"] = new_username
    if changes:
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update user") from exc
        db.refresh(user)
        audit_payload = changes.copy()
        if "username" in audit_payload:
            username_payload = {"username": audit_payload.pop("username")}
            _log_audit(
                db,
                actor=actor,
                target=user,
                action=UserAuditActionEnum.USERNAME_CHANGED,
                payload=username_payload,
            )
        if audit_payload:
            _log_audit(
                db,
                actor=actor,
                target=user,
                action=UserAuditActionEnum.USER_STATUS_CHANGED,
                payload=audit_payload,
            )
        db.commit()
    return _serialize_user(user)


@router.post("/{user_id}/roles", response_model=UserAdminSummary)
def update_user_roles(
    user_id: int,
    payload: UserRolesUpdateRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="change roles")
    try:
        super_requested = SUPER_ADMIN_ROLE_NAME in payload.roles
        filtered_roles = [] if super_requested else [role for role in payload.roles if role != SUPER_ADMIN_ROLE_NAME]
        roles = load_roles(db, filtered_roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _guard_admin_access_loss(
        db,
        actor=actor,
        target=user,
        future_is_super_admin=super_requested,
        future_can_sign_in=can_user_sign_in(user),
    )
    user.roles = roles
    user.is_super_admin = super_requested
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update member link") from exc
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.ROLE_UPDATED,
        payload={"roles": payload.roles},
    )
    db.commit()
    return _serialize_user(user)


@router.post("/{user_id}/member-link", response_model=UserAdminSummary)
def link_member(
    user_id: int,
    payload: UserMemberLinkRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="change the member link")
    if payload.member_id is None:
        if user.member_link:
            user.member_link = None
            try:
                db.commit()
            except IntegrityError as exc:
                db.rollback()
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to update member link") from exc
            _log_audit(
                db,
                actor=actor,
                target=user,
                action=UserAuditActionEnum.MEMBER_UNLINKED,
            )
            db.commit()
        return _serialize_user(_load_user(db, user_id))

    member = _ensure_member_available(db, payload.member_id, current_user_id=user.id)
    if user.member_link is None:
        user.member_link = UserMemberLink(
            member_id=member.id,
            linked_by_user_id=actor.id,
            linked_at=now_utc(),
            notes=payload.notes,
        )
    else:
        user.member_link.member_id = member.id
        user.member_link.linked_by_user_id = actor.id
        user.member_link.linked_at = now_utc()
        user.member_link.notes = payload.notes
    db.commit()
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.MEMBER_LINKED,
        payload={"member_id": member.id},
    )
    db.commit()
    return _serialize_user(user)


@router.post("/{user_id}/suspend", response_model=UserAdminSummary)
def suspend_user(
    user_id: int,
    payload: UserSuspendRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="suspend this account")

    suspended_until = payload.suspended_until
    if suspended_until.tzinfo is None:
        suspended_until = suspended_until.replace(tzinfo=timezone.utc)
    else:
        suspended_until = suspended_until.astimezone(timezone.utc)
    if suspended_until <= now_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Suspension end time must be in the future.",
        )

    _guard_admin_access_loss(
        db,
        actor=actor,
        target=user,
        future_is_super_admin=user.is_super_admin,
        future_can_sign_in=False,
    )

    reason = payload.reason.strip() if payload.reason else None
    user.suspended_until = suspended_until
    user.suspension_reason = reason
    user.suspended_by_user_id = actor.id
    user.updated_at = now_utc()
    db.commit()
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.USER_SUSPENDED,
        payload={"suspended_until": suspended_until.isoformat(), "reason": reason},
    )
    db.commit()
    return _serialize_user(user)


@router.post("/{user_id}/unsuspend", response_model=UserAdminSummary)
def unsuspend_user(
    user_id: int,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="lift the suspension")

    previous_until = user.suspended_until.isoformat() if user.suspended_until else None
    previous_reason = user.suspension_reason
    user.suspended_until = None
    user.suspension_reason = None
    user.suspended_by_user_id = None
    user.updated_at = now_utc()
    db.commit()
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.USER_UNSUSPENDED,
        payload={"previous_suspended_until": previous_until, "previous_reason": previous_reason},
    )
    db.commit()
    return _serialize_user(user)


@router.delete("/{user_id}", response_model=UserAdminSummary)
def delete_user(
    user_id: int,
    payload: UserDeleteRequest | None = None,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    if user.deleted_at is not None:
        return _serialize_user(user)

    _guard_admin_access_loss(
        db,
        actor=actor,
        target=user,
        future_is_super_admin=user.is_super_admin,
        future_can_sign_in=False,
    )

    reason = payload.reason.strip() if payload and payload.reason else None
    user.deleted_at = now_utc()
    user.deletion_reason = reason
    user.deleted_by_user_id = actor.id
    user.is_active = False
    user.suspended_until = None
    user.suspension_reason = None
    user.suspended_by_user_id = None
    user.must_change_password = False
    clear_temporary_password(user)
    user.updated_at = now_utc()
    db.commit()
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.USER_DELETED,
        payload={"reason": reason},
    )
    db.commit()
    return _serialize_user(user)


@router.post("/{user_id}/restore", response_model=UserAdminSummary)
def restore_user(
    user_id: int,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    if user.deleted_at is None:
        return _serialize_user(user)

    previous_deleted_at = user.deleted_at.isoformat()
    previous_reason = user.deletion_reason
    user.deleted_at = None
    user.deletion_reason = None
    user.deleted_by_user_id = None
    user.updated_at = now_utc()
    db.commit()
    db.refresh(user)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.USER_RESTORED,
        payload={"previous_deleted_at": previous_deleted_at, "previous_reason": previous_reason},
    )
    db.commit()
    return _serialize_user(user)


def _create_invitation_record(
    db: Session,
    *,
    email: str,
    full_name: str | None,
    username: str,
    invited_by: User,
    roles: list[str],
    member_id: int | None,
    message: str | None,
) -> tuple[UserInvitation, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hash_token(token)
    invitation = UserInvitation(
        email=email,
        full_name=full_name,
        username=username,
        token_hash=token_hash,
        expires_at=now_utc() + timedelta(hours=settings.USER_INVITE_EXPIRY_HOURS),
        roles_snapshot=roles,
        member_id=member_id,
        invited_by_user_id=invited_by.id,
        message=message,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation, token


@router.post("/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def create_invitation(
    payload: InvitationCreateRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> InvitationResponse:
    existing_user = db.query(User).filter(func.lower(User.email) == payload.email.lower()).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User with that email already exists")
    username = payload.username
    if username:
        try:
            clean_username = ensure_unique_username(db, username)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    else:
        try:
            clean_username = generate_username_from_email(payload.email, db)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    member_id = None
    if payload.member_id is not None:
        _ensure_member_available(db, payload.member_id)
        member_id = payload.member_id

    try:
        filtered_roles = [role for role in payload.roles if role != SUPER_ADMIN_ROLE_NAME]
        load_roles(db, filtered_roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    invitation, raw_token = _create_invitation_record(
        db,
        email=payload.email,
        full_name=payload.full_name.strip() if payload.full_name else None,
        username=clean_username,
        invited_by=actor,
        roles=payload.roles,
        member_id=member_id,
        message=payload.message,
    )
    send_user_invitation_email(invitation, raw_token, actor)
    return InvitationResponse(
        id=invitation.id,
        email=invitation.email,
        username=invitation.username,
        expires_at=invitation.expires_at,
        token=raw_token,
    )


@router.post("/{user_id}/reset-password", response_model=UserPasswordResetResponse)
def reset_user_password(
    user_id: int,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserPasswordResetResponse:
    user = _load_user(db, user_id)
    _ensure_user_not_deleted(user, action_label="reset the password")
    temporary_password = generate_temporary_password()
    user.hashed_password = hash_password(temporary_password)
    store_temporary_password(user, temporary_password)
    user.updated_at = now_utc()
    db.commit()
    db.refresh(user)

    email_sent = False
    try:
        email_sent = send_admin_password_reset_email(
            user=user,
            temporary_password=temporary_password,
            requested_by=actor,
        )
    except Exception:
        logger.exception(
            "admin_password_reset_email_failed",
            extra={"user_id": user.id, "email": user.email, "actor_id": actor.id},
        )
    email_delivery_payload = build_email_delivery_details(recipient=user.email, accepted=email_sent)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.PASSWORD_RESET_SENT,
        payload={
            "email_sent": email_sent,
            "email_delivery": email_delivery_payload,
            "must_change_password": True,
        },
    )
    db.commit()
    return UserPasswordResetResponse(
        user=_serialize_user(_load_user(db, user.id)),
        temporary_password=temporary_password,
        email_sent=email_sent,
        email_delivery=EmailDeliveryDetails(**email_delivery_payload),
    )


@router.get("/{user_id}/audit", response_model=list[UserAuditEntry])
def get_user_audit(
    user_id: int,
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> list[UserAuditEntry]:
    _ = _load_user(db, user_id)  # ensure exists
    entries = (
        db.query(UserAuditLog)
        .options(joinedload(UserAuditLog.actor))
        .filter(UserAuditLog.target_user_id == user_id)
        .order_by(UserAuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    response: list[UserAuditEntry] = []
    for entry in entries:
        actor = entry.actor
        response.append(
            UserAuditEntry(
                id=entry.id,
                action=entry.action.value if hasattr(entry.action, "value") else entry.action,
                actor_email=actor.email if actor else None,
                actor_name=actor.full_name if actor else None,
                payload=entry.payload or {},
                created_at=entry.created_at,
            )
        )
    return response
