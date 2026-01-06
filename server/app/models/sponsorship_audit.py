from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

SponsorshipAuditAction = Enum(
    "StatusChange",
    "Approval",
    "Rejection",
    "Suspension",
    "Reactivation",
    "BeneficiaryChange",
    name="sponsorship_audit_action",
)


class SponsorshipStatusAudit(Base):
    __tablename__ = "sponsorship_status_audits"

    id = Column(Integer, primary_key=True)
    sponsorship_id = Column(Integer, ForeignKey("sponsorships.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(SponsorshipAuditAction, nullable=False, default="StatusChange")
    from_status = Column(String(40), nullable=True)
    to_status = Column(String(40), nullable=True)
    reason = Column(Text, nullable=True)
    changed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    sponsorship = relationship("Sponsorship", back_populates="status_audits")
    actor = relationship("User", foreign_keys=[changed_by_id])
