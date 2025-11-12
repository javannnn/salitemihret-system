from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

NewcomerStatus = Enum("New", "InProgress", "Sponsored", "Converted", "Closed", name="newcomer_status")


class Newcomer(Base):
    __tablename__ = "newcomers"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    preferred_language = Column(String(60), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    contact_email = Column(String(255), nullable=True)
    family_size = Column(Integer, nullable=True)
    service_type = Column(String(120), nullable=True)
    arrival_date = Column(Date, nullable=False)
    country = Column(String(120), nullable=True)
    temporary_address = Column(String(255), nullable=True)
    referred_by = Column(String(120), nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(NewcomerStatus, nullable=False, default="New")
    sponsored_by_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    father_of_repentance_id = Column(Integer, ForeignKey("priests.id", ondelete="SET NULL"), nullable=True)
    assigned_owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    followup_due_date = Column(Date, nullable=True)
    converted_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    sponsored_by_member = relationship("Member", foreign_keys=[sponsored_by_member_id])
    converted_member = relationship("Member", foreign_keys=[converted_member_id])
    assigned_owner = relationship("User")
    father_of_repentance = relationship("Priest")
    sponsorships = relationship("Sponsorship", back_populates="newcomer")

    @property
    def full_name(self) -> str:
        return " ".join(filter(None, [self.first_name, self.last_name]))
