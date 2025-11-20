from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.core.db import Base


class Household(Base):
    __tablename__ = "households"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False, unique=True)
    head_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    head = relationship("Member", foreign_keys=[head_member_id], backref="headed_household", lazy="joined")
    members = relationship("Member", back_populates="household", foreign_keys="Member.household_id")

    @property
    def members_count(self) -> int:
        return len([member for member in self.members if getattr(member, "deleted_at", None) is None])
