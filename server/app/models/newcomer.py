from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

NewcomerStatus = Enum(
    "New",
    "Contacted",
    "Assigned",
    "InProgress",
    "Settled",
    "Closed",
    "Sponsored",
    "Converted",
    name="newcomer_status",
)
NewcomerHouseholdType = Enum("Individual", "Family", name="newcomer_household_type")


class Newcomer(Base):
    __tablename__ = "newcomers"

    id = Column(Integer, primary_key=True)
    newcomer_code = Column(String(20), nullable=False, unique=True, index=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    household_type = Column(NewcomerHouseholdType, nullable=False, default="Individual")
    preferred_language = Column(String(60), nullable=True)
    interpreter_required = Column(Boolean, nullable=False, default=False)
    contact_phone = Column(String(50), nullable=True)
    contact_whatsapp = Column(String(50), nullable=True)
    contact_email = Column(String(255), nullable=True)
    family_size = Column(Integer, nullable=True)
    service_type = Column(String(120), nullable=True)
    arrival_date = Column(Date, nullable=False)
    country = Column(String(120), nullable=True)
    temporary_address = Column(String(255), nullable=True)
    temporary_address_street = Column(String(255), nullable=True)
    temporary_address_city = Column(String(120), nullable=True)
    temporary_address_province = Column(String(120), nullable=True)
    temporary_address_postal_code = Column(String(20), nullable=True)
    current_address_street = Column(String(255), nullable=True)
    current_address_city = Column(String(120), nullable=True)
    current_address_province = Column(String(120), nullable=True)
    current_address_postal_code = Column(String(20), nullable=True)
    county = Column(String(120), nullable=True)
    referred_by = Column(String(120), nullable=True)
    past_profession = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(NewcomerStatus, nullable=False, default="New")
    is_inactive = Column(Boolean, nullable=False, default=False)
    inactive_reason = Column(Text, nullable=True)
    inactive_notes = Column(Text, nullable=True)
    inactive_at = Column(DateTime, nullable=True)
    inactive_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sponsored_by_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    father_of_repentance_id = Column(Integer, ForeignKey("priests.id", ondelete="SET NULL"), nullable=True)
    assigned_owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    followup_due_date = Column(Date, nullable=True)
    converted_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    sponsored_by_member = relationship("Member", foreign_keys=[sponsored_by_member_id])
    converted_member = relationship("Member", foreign_keys=[converted_member_id])
    assigned_owner = relationship("User", foreign_keys=[assigned_owner_id])
    father_of_repentance = relationship("Priest")
    inactive_by = relationship("User", foreign_keys=[inactive_by_id])
    sponsorships = relationship("Sponsorship", back_populates="newcomer")
    address_history = relationship(
        "NewcomerAddressHistory",
        back_populates="newcomer",
        cascade="all, delete-orphan",
        order_by="NewcomerAddressHistory.changed_at.desc()",
    )
    interactions = relationship(
        "NewcomerInteraction",
        back_populates="newcomer",
        cascade="all, delete-orphan",
        order_by="NewcomerInteraction.occurred_at.desc()",
    )
    status_audits = relationship(
        "NewcomerStatusAudit",
        back_populates="newcomer",
        cascade="all, delete-orphan",
        order_by="NewcomerStatusAudit.changed_at.desc()",
    )

    @property
    def full_name(self) -> str:
        return " ".join(filter(None, [self.first_name, self.last_name]))
