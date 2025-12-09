from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
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
    InvitationCreateRequest,
    InvitationResponse,
    UserAdminSummary,
    UserAuditEntry,
    UserListResponse,
    UserMemberLinkRequest,
    UserRolesUpdateRequest,
    UserUpdateRequest,
    UserMemberSummary,
)
from app.services.user_accounts import (
    ensure_unique_username,
    generate_username_from_email,
    hash_token,
    load_roles,
    now_utc,
    sanitize_username,
)
from app.services.notifications import send_password_reset_email, send_user_invitation_email

router = APIRouter(prefix="/users", tags=["users"])
SUPER_ADMIN_ROLE_NAME = "SuperAdmin"


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
    if user.is_super_admin and SUPER_ADMIN_ROLE_NAME not in role_names:
        role_names.append(SUPER_ADMIN_ROLE_NAME)
    return UserAdminSummary(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        is_active=user.is_active,
        is_super_admin=user.is_super_admin,
        roles=role_names,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
        member=_serialize_member(user.member_link, owning_user=user),
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


@router.get("", response_model=UserListResponse)
def list_users(
    search: str | None = Query(default=None, description="Search email, username, or name"),
    role: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
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
    total_active = db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0
    total_inactive = db.query(func.count(User.id)).filter(User.is_active.is_(False)).scalar() or 0
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


@router.get("/{user_id}", response_model=UserAdminSummary)
def get_user_detail(
    user_id: int,
    _: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    return _serialize_user(user)


@router.patch("/{user_id}", response_model=UserAdminSummary)
def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> UserAdminSummary:
    user = _load_user(db, user_id)
    changes: dict[str, Any] = {}
    if payload.full_name is not None:
        user.full_name = payload.full_name
        changes["full_name"] = payload.full_name
    if payload.is_active is not None:
        user.is_active = payload.is_active
        changes["is_active"] = payload.is_active
    if payload.is_super_admin is not None:
        user.is_super_admin = payload.is_super_admin
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
        db.commit()
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
    try:
        super_requested = SUPER_ADMIN_ROLE_NAME in payload.roles
        filtered_roles = [role for role in payload.roles if role != SUPER_ADMIN_ROLE_NAME]
        roles = load_roles(db, filtered_roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    user.roles = roles
    user.is_super_admin = super_requested
    db.commit()
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
    if payload.member_id is None:
        if user.member_link:
            db.delete(user.member_link)
            db.commit()
            _log_audit(
                db,
                actor=actor,
                target=user,
                action=UserAuditActionEnum.MEMBER_UNLINKED,
            )
            db.commit()
        return _serialize_user(user)

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


def _create_invitation_record(
    db: Session,
    *,
    email: str,
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
        clean_username = generate_username_from_email(payload.email, db)
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


@router.post("/{user_id}/reset-password", response_model=InvitationResponse)
def reset_user_password(
    user_id: int,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> InvitationResponse:
    user = _load_user(db, user_id)
    roles = [role.name for role in user.roles]
    member_id = user.member_link.member_id if user.member_link else None
    invitation, raw_token = _create_invitation_record(
        db,
        email=user.email,
        username=user.username,
        invited_by=actor,
        roles=roles,
        member_id=member_id,
        message="Password reset",
    )
    email_sent = send_password_reset_email(invitation, raw_token, actor)
    _log_audit(
        db,
        actor=actor,
        target=user,
        action=UserAuditActionEnum.PASSWORD_RESET_SENT,
        payload={"invitation_id": invitation.id, "email_sent": email_sent},
    )
    db.commit()
    return InvitationResponse(
        id=invitation.id,
        email=invitation.email,
        username=invitation.username,
        expires_at=invitation.expires_at,
        token=raw_token,
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
