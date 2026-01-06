from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

NewcomerInteractionType = Enum(
    "Call",
    "Visit",
    "Meeting",
    "Note",
    "Other",
    name="newcomer_interaction_type",
)
NewcomerInteractionVisibility = Enum(
    "Restricted",
    "Shared",
    name="newcomer_interaction_visibility",
)
NewcomerAddressType = Enum(
    "Temporary",
    "Current",
    name="newcomer_address_type",
)
NewcomerAuditAction = Enum(
    "StatusChange",
    "Reopen",
    "Inactivate",
    "Reactivate",
    "Assignment",
    "SponsorshipLink",
    "SponsorshipUnlink",
    name="newcomer_audit_action",
)


class NewcomerInteraction(Base):
    __tablename__ = "newcomer_interactions"

    id = Column(Integer, primary_key=True)
    newcomer_id = Column(Integer, ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False, index=True)
    interaction_type = Column(NewcomerInteractionType, nullable=False, default="Note")
    visibility = Column(NewcomerInteractionVisibility, nullable=False, default="Restricted")
    note = Column(Text, nullable=False)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    newcomer = relationship("Newcomer", back_populates="interactions")
    author = relationship("User", foreign_keys=[created_by_id])


class NewcomerAddressHistory(Base):
    __tablename__ = "newcomer_address_history"

    id = Column(Integer, primary_key=True)
    newcomer_id = Column(Integer, ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False, index=True)
    address_type = Column(NewcomerAddressType, nullable=False)
    street = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    province = Column(String(120), nullable=True)
    postal_code = Column(String(20), nullable=True)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    changed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    newcomer = relationship("Newcomer", back_populates="address_history")
    actor = relationship("User", foreign_keys=[changed_by_id])


class NewcomerStatusAudit(Base):
    __tablename__ = "newcomer_status_audits"

    id = Column(Integer, primary_key=True)
    newcomer_id = Column(Integer, ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(NewcomerAuditAction, nullable=False, default="StatusChange")
    from_status = Column(String(40), nullable=True)
    to_status = Column(String(40), nullable=True)
    reason = Column(Text, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    newcomer = relationship("Newcomer", back_populates="status_audits")
    actor = relationship("User", foreign_keys=[changed_by_id])
