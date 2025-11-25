from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth.deps import get_current_user
from app.auth.security import hash_password, verify_password
from app.core.config import settings
from app.core.db import get_db
from app.models.member import Member
from app.models.user import User, UserMemberLink, UserAuditLog, UserAuditAction
from app.schemas.account import (
    AccountProfileResponse,
    MemberLinkRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    AccountMemberSummary,
)
from app.services.user_accounts import ensure_unique_username, validate_password_strength, now_utc

router = APIRouter(prefix="/account", tags=["account"])


def _serialize_account_user(user: User) -> AccountProfileResponse:
    member_summary = None
    if user.member_link and user.member_link.member:
        member = user.member_link.member
        member_summary = AccountMemberSummary(
            id=member.id,
            first_name=member.first_name,
            last_name=member.last_name,
            status=user.member_link.status.value if hasattr(user.member_link.status, "value") else user.member_link.status,
        )
    cooldown = timedelta(days=settings.USERNAME_CHANGE_COOLDOWN_DAYS)
    next_change_at = None
    can_change = True
    if user.username_changed_at:
        next_change_at = user.username_changed_at + cooldown
        can_change = next_change_at <= now_utc()
    return AccountProfileResponse(
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        roles=[role.name for role in user.roles],
        is_super_admin=user.is_super_admin,
        member=member_summary,
        can_change_username=can_change,
        next_username_change_at=next_change_at,
    )


def _refresh_user(db: Session, user: User) -> User:
    return (
        db.query(User)
        .options(joinedload(User.roles), joinedload(User.member_link).joinedload(UserMemberLink.member))
        .filter(User.id == user.id)
        .one()
    )


@router.get("/me", response_model=AccountProfileResponse)
def get_my_account(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountProfileResponse:
    hydrated = _refresh_user(db, user)
    return _serialize_account_user(hydrated)


@router.patch("/me/profile", response_model=AccountProfileResponse)
def update_my_profile(
    payload: ProfileUpdateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountProfileResponse:
    dirty = False
    if payload.full_name is not None:
        user.full_name = payload.full_name
        dirty = True
    if payload.username:
        desired = payload.username.lower()
        if desired != user.username:
            cooldown = timedelta(days=settings.USERNAME_CHANGE_COOLDOWN_DAYS)
            if user.username_changed_at and user.username_changed_at + cooldown > now_utc():
                available_at = user.username_changed_at + cooldown
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Username can be changed again on {available_at.isoformat()}",
                )
            try:
                new_username = ensure_unique_username(db, desired, exclude_user_id=user.id)
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
            user.username = new_username
            user.username_changed_at = now_utc()
            dirty = True
    if not dirty:
        return _serialize_account_user(_refresh_user(db, user))
    user.updated_at = now_utc()
    db.commit()
    refreshed = _refresh_user(db, user)
    return _serialize_account_user(refreshed)


@router.patch("/me/password")
def change_my_password(
    payload: PasswordChangeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    try:
        validate_password_strength(payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = now_utc()
    db.commit()
    return {"status": "ok"}


@router.post("/me/member-link-request", response_model=AccountProfileResponse)
def request_member_link(
    payload: MemberLinkRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccountProfileResponse:
    link = (
        db.query(UserMemberLink)
        .options(joinedload(UserMemberLink.member))
        .filter(UserMemberLink.user_id == user.id)
        .first()
    )
    if payload.member_id is None:
        if not link or not link.member_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No linked member to unlink")
        link.status = "pending_review"
        link.notes = payload.notes or "User requested unlink"
        link.linked_at = now_utc()
        link.linked_by_user_id = user.id
    else:
        member: Member | None = db.get(Member, payload.member_id)
        if not member:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member not found")
        existing = (
            db.query(UserMemberLink)
            .filter(UserMemberLink.member_id == payload.member_id, UserMemberLink.user_id != user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already linked to another user")
        if link is None:
            link = UserMemberLink(
                user_id=user.id,
                member_id=payload.member_id,
                status="pending_review",
                notes=payload.notes,
                linked_by_user_id=user.id,
                linked_at=now_utc(),
            )
            db.add(link)
        else:
            link.member_id = payload.member_id
            link.status = "pending_review"
            link.notes = payload.notes
            link.linked_by_user_id = user.id
            link.linked_at = now_utc()
    db.add(
        UserAuditLog(
            actor_user_id=user.id,
            target_user_id=user.id,
            action=UserAuditAction.LINK_REQUESTED,
            payload={"member_id": payload.member_id, "notes": payload.notes},
            created_at=now_utc(),
        )
    )
    db.commit()
    refreshed = _refresh_user(db, user)
    return _serialize_account_user(refreshed)
