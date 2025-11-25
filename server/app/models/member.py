from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, and_
from sqlalchemy.orm import relationship

from app.core.db import Base

MemberStatus = Enum("Active", "Inactive", "Pending", "Archived", name="member_status")
MemberGender = Enum("Male", "Female", "Other", name="member_gender")
MemberMaritalStatus = Enum(
    "Single",
    "Married",
    "Divorced",
    "Widowed",
    "Separated",
    "Other",
    name="member_marital_status",
)
ContributionExceptionReason = Enum(
    "LowIncome",
    "Senior",
    "Student",
    "Other",
    name="member_contribution_exception_reason",
)


class Member(Base):
    __tablename__ = "members"

    id = Column(Integer, primary_key=True)
    first_name = Column(String(100), nullable=False)
    middle_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=False)
    username = Column(String(150), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True)
    phone = Column(String(25), nullable=True)
    birth_date = Column(Date, nullable=True)
    gender = Column(MemberGender, nullable=True)
    join_date = Column(Date, nullable=True)
    baptismal_name = Column(String(150), nullable=True)
    marital_status = Column(MemberMaritalStatus, nullable=True)
    address = Column(String(255), nullable=True)
    address_street = Column(String(255), nullable=True)
    address_city = Column(String(120), nullable=True)
    address_region = Column(String(120), nullable=True)
    address_postal_code = Column(String(30), nullable=True)
    address_country = Column(String(120), nullable=True)
    district = Column(String(100), nullable=True)
    status = Column(MemberStatus, nullable=False, default="Active")
    is_tither = Column(Boolean, default=False, nullable=False)
    pays_contribution = Column(Boolean, default=False, nullable=False)
    contribution_method = Column(String(100), nullable=True)
    contribution_amount = Column(Numeric(10, 2), nullable=False, default=75)
    contribution_currency = Column(String(3), nullable=False, default="CAD")
    contribution_exception_reason = Column(ContributionExceptionReason, nullable=True)
    contribution_last_paid_at = Column(DateTime(timezone=True), nullable=True)
    contribution_next_due_at = Column(DateTime(timezone=True), nullable=True)
    status_auto = Column(MemberStatus, nullable=False, default="Pending")
    status_override = Column(Boolean, default=False, nullable=False)
    status_override_value = Column(MemberStatus, nullable=True)
    status_override_reason = Column(String(255), nullable=True)
    notes = Column(String(500), nullable=True)
    avatar_path = Column(String(255), nullable=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="SET NULL"), nullable=True)
    household_size_override = Column(Integer, nullable=True)
    has_father_confessor = Column(Boolean, default=False, nullable=False)
    father_confessor_id = Column(Integer, ForeignKey("priests.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    spouse = relationship("Spouse", uselist=False, back_populates="member", cascade="all, delete-orphan")
    children_all = relationship(
        "Child",
        back_populates="parent",
        cascade="all, delete-orphan",
        lazy="joined",
    )
    children = relationship(
        "Child",
        primaryjoin="and_(Child.member_id == Member.id, Child.promoted_at.is_(None))",
        viewonly=True,
        order_by="Child.id",
    )
    household = relationship("Household", back_populates="members", foreign_keys=[household_id])
    tags = relationship("Tag", secondary="member_tags", back_populates="members")
    ministries = relationship("Ministry", secondary="member_ministries", back_populates="members")
    father_confessor = relationship("Priest", back_populates="members")
    audit_entries = relationship("MemberAudit", back_populates="member", cascade="all, delete-orphan", order_by="MemberAudit.changed_at.desc()")
    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="created_members")
    updated_by = relationship("User", foreign_keys=[updated_by_id], back_populates="updated_members")
    contribution_payments = relationship(
        "MemberContributionPayment",
        back_populates="member",
        cascade="all, delete-orphan",
        order_by="MemberContributionPayment.paid_at.desc(), MemberContributionPayment.id.desc()",
    )
    abenet_enrollments = relationship("AbenetEnrollment", back_populates="parent")
    user_link = relationship("UserMemberLink", back_populates="member", uselist=False)

    @property
    def family_count(self) -> int:
        if self.household_size_override:
            return self.household_size_override

        active_children = len([child for child in self.children_all if child.promoted_at is None])
        household_members = 1

        if self.household:
            household_members = len([member for member in self.household.members if member.deleted_at is None])  # type: ignore[attr-defined]
            household_members = max(household_members, 1)

        total = household_members + active_children
        return max(total, 1)

    @property
    def contribution_history(self):
        return self.contribution_payments


class Spouse(Base):
    __tablename__ = "spouses"

    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False, unique=True)
    first_name = Column(String(120), nullable=True)
    last_name = Column(String(120), nullable=True)
    full_name = Column(String(255), nullable=False)
    gender = Column(MemberGender, nullable=True)
    country_of_birth = Column(String(120), nullable=True)
    phone = Column(String(25), nullable=True)
    email = Column(String(255), nullable=True)

    member = relationship("Member", back_populates="spouse")


class Child(Base):
    __tablename__ = "children"

    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    first_name = Column(String(120), nullable=True)
    last_name = Column(String(120), nullable=True)
    full_name = Column(String(255), nullable=False)
    gender = Column(MemberGender, nullable=True)
    country_of_birth = Column(String(120), nullable=True)
    birth_date = Column(Date, nullable=True)
    notes = Column(String(255), nullable=True)
    promoted_at = Column(DateTime, nullable=True)

    parent = relationship("Member", back_populates="children_all")
