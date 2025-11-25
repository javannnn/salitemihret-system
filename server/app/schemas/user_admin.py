from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UserMemberSummary(BaseModel):
    id: int
    first_name: str
    last_name: str
    username: str
    status: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    linked_user_id: int | None = None
    linked_username: str | None = None

    class Config:
        from_attributes = True


class UserAdminSummary(BaseModel):
    id: int
    email: EmailStr
    username: str
    full_name: str | None = None
    is_active: bool
    is_super_admin: bool
    roles: list[str]
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    member: UserMemberSummary | None = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: list[UserAdminSummary]
    total: int
    limit: int
    offset: int
    total_active: int
    total_inactive: int
    total_linked: int
    total_unlinked: int


class InvitationCreateRequest(BaseModel):
    email: EmailStr
    full_name: str | None = None
    username: str | None = None
    roles: list[str] = Field(default_factory=list)
    member_id: int | None = None
    message: str | None = Field(default=None, max_length=500)


class InvitationResponse(BaseModel):
    id: int
    email: EmailStr
    username: str
    expires_at: datetime
    token: str


class UserUpdateRequest(BaseModel):
    full_name: str | None = None
    username: str | None = None
    is_active: bool | None = None
    is_super_admin: bool | None = None


class UserRolesUpdateRequest(BaseModel):
    roles: list[str]


class UserMemberLinkRequest(BaseModel):
    member_id: int | None = None
    notes: str | None = Field(default=None, max_length=255)


class UserAuditEntry(BaseModel):
    id: int
    action: str
    actor_email: EmailStr | None = None
    actor_name: str | None = None
    payload: dict[str, Any] | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class InvitationAcceptRequest(BaseModel):
    password: str
    full_name: str | None = None
    username: str | None = None
