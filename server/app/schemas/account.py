from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AccountMemberSummary(BaseModel):
    id: int
    first_name: str
    last_name: str
    status: str | None = None
    email: str | None = None
    phone: str | None = None

    class Config:
        from_attributes = True


class AccountProfileResponse(BaseModel):
    email: str
    username: str
    full_name: str | None = None
    roles: list[str]
    is_super_admin: bool
    member: AccountMemberSummary | None = None
    can_change_username: bool
    next_username_change_at: datetime | None = None

    class Config:
        from_attributes = True


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    username: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class MemberLinkRequest(BaseModel):
    member_id: int | None = None
    notes: str | None = None
