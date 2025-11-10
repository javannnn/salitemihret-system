from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.db import Base


class PaymentDayLock(Base):
    __tablename__ = "payment_day_locks"

    day = Column(Date, primary_key=True)
    locked = Column(Boolean, nullable=False, default=True)
    locked_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    locked_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    unlocked_at = Column(DateTime(timezone=True), nullable=True)
    unlocked_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    unlock_reason = Column(String(255), nullable=True)

    locked_by = relationship("User", foreign_keys=[locked_by_id])
    unlocked_by = relationship("User", foreign_keys=[unlocked_by_id])
