from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.core.db import Base


class MemberContributionPayment(Base):
    __tablename__ = "member_contribution_payments"

    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="CAD")
    paid_at = Column(Date, nullable=False, default=date.today)
    method = Column(String(100), nullable=True)
    note = Column(String(255), nullable=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    member = relationship("Member", back_populates="contribution_payments")
    recorded_by = relationship("User")

