from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, JSON, String, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.db import Base

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(150), unique=True, nullable=False, index=True)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_super_admin = Column(Boolean, default=False, nullable=False)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    username_changed_at = Column(DateTime(timezone=True), nullable=True)

    roles = relationship("Role", secondary=user_roles, lazy="joined")
    created_members = relationship("Member", foreign_keys="Member.created_by_id", back_populates="created_by")
    updated_members = relationship("Member", foreign_keys="Member.updated_by_id", back_populates="updated_by")
    member_audits = relationship("MemberAudit", back_populates="actor")
    member_link = relationship(
        "UserMemberLink",
        uselist=False,
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserMemberLink.user_id",
    )
    audit_entries = relationship(
        "UserAuditLog",
        foreign_keys="UserAuditLog.target_user_id",
        back_populates="target_user",
        cascade="all, delete-orphan",
    )
    audit_events = relationship(
        "UserAuditLog",
        foreign_keys="UserAuditLog.actor_user_id",
        back_populates="actor",
        viewonly=True,
    )
    invitations_sent = relationship(
        "UserInvitation",
        foreign_keys="UserInvitation.invited_by_user_id",
        back_populates="invited_by",
    )
    invitations_accepted = relationship(
        "UserInvitation",
        foreign_keys="UserInvitation.accepted_user_id",
        back_populates="accepted_user",
        viewonly=True,
    )


UserMemberLinkStatus = Enum("linked", "pending_review", "rejected", name="user_member_link_status")
UserAuditAction = Enum(
    "INVITE_SENT",
    "USER_CREATED",
    "ROLE_UPDATED",
    "USERNAME_CHANGED",
    "MEMBER_LINKED",
    "MEMBER_UNLINKED",
    "PASSWORD_RESET_SENT",
    "USER_STATUS_CHANGED",
    "LINK_REQUESTED",
    name="user_audit_action",
)


class UserMemberLink(Base):
    __tablename__ = "user_member_links"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, unique=True)
    status = Column(UserMemberLinkStatus, nullable=False, default="linked")
    notes = Column(String(255), nullable=True)
    linked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    linked_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="member_link", foreign_keys=[user_id])
    member = relationship("Member", back_populates="user_link")
    linked_by = relationship("User", foreign_keys=[linked_by_user_id])


class UserInvitation(Base):
    __tablename__ = "user_invitations"

    id = Column(Integer, primary_key=True)
    email = Column(String(255), nullable=False)
    username = Column(String(150), nullable=False)
    token_hash = Column(String(255), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    roles_snapshot = Column(JSON, nullable=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    invited_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    accepted_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    message = Column(String(500), nullable=True)

    invited_by = relationship("User", foreign_keys=[invited_by_user_id], back_populates="invitations_sent")
    accepted_user = relationship("User", foreign_keys=[accepted_user_id], back_populates="invitations_accepted")
    member = relationship("Member")


class UserAuditLog(Base):
    __tablename__ = "user_audit_logs"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(UserAuditAction, nullable=False)
    target_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)

    actor = relationship("User", foreign_keys=[actor_user_id], back_populates="audit_events")
    target_user = relationship("User", foreign_keys=[target_user_id], back_populates="audit_entries")
