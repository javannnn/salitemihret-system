from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

SponsorshipStatus = Enum("Draft", "Active", "Suspended", "Completed", "Closed", name="sponsorship_status")
SponsorshipFrequency = Enum("OneTime", "Monthly", "Quarterly", "Yearly", name="sponsorship_frequency")
SponsorshipDecision = Enum("Approved", "Rejected", "Pending", name="sponsorship_decision")
SponsorshipPledgeChannel = Enum("InPerson", "OnlinePortal", "Phone", "EventBooth", name="sponsorship_pledge_channel")
SponsorshipReminderChannel = Enum("Email", "SMS", "Phone", "WhatsApp", name="sponsorship_reminder_channel")
SponsorshipMotivation = Enum(
    "HonorMemorial",
    "CommunityOutreach",
    "Corporate",
    "ParishInitiative",
    "Other",
    name="sponsorship_motivation",
)
SponsorshipNotesTemplate = Enum("FollowUp", "PaymentIssue", "Gratitude", "Escalation", name="sponsorship_notes_template")


class Sponsorship(Base):
    __tablename__ = "sponsorships"

    id = Column(Integer, primary_key=True)
    sponsor_member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True)
    beneficiary_member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    newcomer_id = Column(Integer, ForeignKey("newcomers.id", ondelete="SET NULL"), nullable=True, index=True)
    beneficiary_name = Column(String(255), nullable=False)
    father_of_repentance_id = Column(Integer, ForeignKey("priests.id", ondelete="SET NULL"), nullable=True)
    volunteer_service = Column(String(255), nullable=True)
    volunteer_services = Column(Text, nullable=True)
    volunteer_service_other = Column(String(255), nullable=True)
    payment_information = Column(String(255), nullable=True)
    last_sponsored_date = Column(Date, nullable=True)
    frequency = Column(SponsorshipFrequency, nullable=False, default="Monthly")
    last_status = Column(SponsorshipDecision, nullable=True)
    last_status_reason = Column(String(255), nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(SponsorshipStatus, nullable=False, default="Draft", index=True)
    monthly_amount = Column(Numeric(12, 2), nullable=False)
    program = Column(String(120), nullable=True, index=True)
    pledge_channel = Column(SponsorshipPledgeChannel, nullable=True)
    reminder_channel = Column(SponsorshipReminderChannel, nullable=True, default="Email")
    motivation = Column(SponsorshipMotivation, nullable=True)
    budget_month = Column(Integer, nullable=True)
    budget_year = Column(Integer, nullable=True)
    budget_amount = Column(Numeric(12, 2), nullable=True)
    budget_slots = Column(Integer, nullable=True)
    used_slots = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)
    notes_template = Column(SponsorshipNotesTemplate, nullable=True)
    reminder_last_sent = Column(DateTime, nullable=True)
    reminder_next_due = Column(DateTime, nullable=True)
    assigned_staff_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    sponsor = relationship("Member", foreign_keys=[sponsor_member_id], backref="sponsorships")
    beneficiary_member = relationship("Member", foreign_keys=[beneficiary_member_id], backref="beneficiary_sponsorships")
    newcomer = relationship("Newcomer", back_populates="sponsorships")
    assigned_staff = relationship("User", foreign_keys=[assigned_staff_id])
    created_by = relationship("User", foreign_keys=[created_by_id], backref="created_sponsorships")
    updated_by = relationship("User", foreign_keys=[updated_by_id], backref="updated_sponsorships")
    father_of_repentance = relationship("Priest")
