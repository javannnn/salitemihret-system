from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password, verify_password
from app.core.db import get_db
from app.core.config import settings
from app.models.user import User, UserInvitation, UserMemberLink, UserAuditLog, UserAuditActionEnum
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user_admin import InvitationAcceptRequest
from app.services.user_accounts import (
    ensure_unique_username,
    hash_token,
    load_roles,
    now_utc,
    validate_password_strength,
)
from app.services.recaptcha import verify_recaptcha, RecaptchaError

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    if settings.RECAPTCHA_SECRET:
        if not payload.recaptcha_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing reCAPTCHA token")
        client_ip = request.client.host if request.client else None
        try:
            await verify_recaptcha(payload.recaptcha_token, remote_ip=client_ip)
        except RecaptchaError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    roles = [role.name for role in user.roles]
    token = create_access_token(subject=str(user.id), roles=roles)
    return TokenResponse(access_token=token)


@router.post("/invitations/{token}", response_model=TokenResponse)
def accept_invitation(token: str, payload: InvitationAcceptRequest, db: Session = Depends(get_db)) -> TokenResponse:
    token_hash = hash_token(token)
    invitation = db.query(UserInvitation).filter(UserInvitation.token_hash == token_hash).first()
    if not invitation:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid invitation token")
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation already used")
    if invitation.expires_at < now_utc():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invitation expired")
    existing_user = db.query(User).filter(User.email == invitation.email).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")
    try:
        validate_password_strength(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    username_source = payload.username or invitation.username
    try:
        username = ensure_unique_username(db, username_source)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    roles_snapshot = invitation.roles_snapshot or []
    is_super_admin_invite = "SuperAdmin" in roles_snapshot
    filtered_roles = [role for role in roles_snapshot if role != "SuperAdmin"]
    try:
        roles = load_roles(db, filtered_roles)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    user = User(
        email=invitation.email,
        username=username,
        full_name=payload.full_name or invitation.username,
        hashed_password=hash_password(payload.password),
        is_active=True,
        is_super_admin=is_super_admin_invite,
        created_at=now_utc(),
        updated_at=now_utc(),
    )
    user.roles = roles
    db.add(user)
    db.flush()

    if invitation.member_id:
        existing_link = (
            db.query(UserMemberLink)
            .filter(UserMemberLink.member_id == invitation.member_id)
            .first()
        )
        if existing_link:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Member already linked to another user")
        user.member_link = UserMemberLink(
            member_id=invitation.member_id,
            linked_by_user_id=invitation.invited_by_user_id or user.id,
            linked_at=now_utc(),
        )

    invitation.accepted_at = now_utc()
    invitation.accepted_user_id = user.id

    audit_entry = UserAuditLog(
        actor_user_id=user.id,
        target_user_id=user.id,
        action=UserAuditActionEnum.USER_CREATED,
        payload={"via_invitation": True},
        created_at=now_utc(),
    )
    db.add(audit_entry)
    if user.member_link and user.member_link.member_id:
        db.add(
            UserAuditLog(
                actor_user_id=user.id,
                target_user_id=user.id,
                action=UserAuditActionEnum.MEMBER_LINKED,
                payload={"member_id": user.member_link.member_id},
                created_at=now_utc(),
            )
        )

    db.commit()
    roles_names = [role.name for role in roles]
    if is_super_admin_invite:
        roles_names.append("SuperAdmin")
    token_response = create_access_token(subject=str(user.id), roles=roles_names)
    return TokenResponse(access_token=token_response)
