from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, JSON
from sqlalchemy.orm import relationship

from app.core.db import Base
from app.models.member import Member, Child, MemberGender
from app.models.payment import Payment
from app.models.user import User


SundayCategory = Enum("Child", "Youth", "Adult", name="sunday_category")
LessonLevel = Enum("SundaySchool", "Abenet", name="lesson_level")
MezmurLanguage = Enum("Geez", "Amharic", "English", name="mezmur_language")
MezmurCategory = Enum("Liturgy", "Youth", "SpecialEvent", name="mezmur_category")
WeekdayName = Enum("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", name="weekday_name")
AbenetServiceStage = Enum("Alphabet", "Reading", "ForDeacons", name="abenet_service_stage")
AbenetEnrollmentStatus = Enum("Active", "Paused", "Completed", "Cancelled", name="abenet_enrollment_status")
SundayContentType = Enum("Mezmur", "Lesson", "Art", name="sunday_content_type")
SundayContentStatus = Enum("Draft", "Pending", "Approved", "Rejected", name="sunday_content_status")


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True)
    lesson_code = Column(String(50), nullable=False, unique=True)
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    level = Column(LessonLevel, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=60)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class Mezmur(Base):
    __tablename__ = "mezmur"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False, unique=True)
    title = Column(String(150), nullable=False)
    language = Column(MezmurLanguage, nullable=False)
    category = Column(MezmurCategory, nullable=False)
    rehearsal_day = Column(WeekdayName, nullable=False)
    conductor_name = Column(String(120), nullable=True)
    capacity = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class AbenetEnrollment(Base):
    __tablename__ = "abenet_enrollments"

    id = Column(Integer, primary_key=True)
    parent_member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    child_id = Column(Integer, ForeignKey("children.id", ondelete="SET NULL"), nullable=True)
    child_first_name = Column(String(120), nullable=False)
    child_last_name = Column(String(120), nullable=False)
    birth_date = Column(Date, nullable=False)
    service_stage = Column(AbenetServiceStage, nullable=False)
    monthly_amount = Column(Numeric(12, 2), nullable=False)
    status = Column(AbenetEnrollmentStatus, nullable=False, default="Active")
    enrollment_date = Column(Date, nullable=False)
    last_payment_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship(Member, foreign_keys=[parent_member_id], back_populates="abenet_enrollments")
    child = relationship(Child)
    payments = relationship(
        "AbenetEnrollmentPayment",
        back_populates="enrollment",
        cascade="all, delete-orphan",
        order_by="AbenetEnrollmentPayment.created_at.desc()",
    )


class SundaySchoolEnrollment(Base):
    __tablename__ = "sunday_school_enrollments"

    id = Column(Integer, primary_key=True)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="CASCADE"), nullable=False)
    member_username = Column(String(150), nullable=False, index=True)
    first_name = Column(String(120), nullable=False)
    last_name = Column(String(120), nullable=False)
    gender = Column(MemberGender, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    category = Column(SundayCategory, nullable=False, default="Child")
    membership_date = Column(Date, nullable=False)
    phone = Column(String(40), nullable=True)
    email = Column(String(255), nullable=True)
    pays_contribution = Column(Boolean, default=False, nullable=False)
    monthly_amount = Column(Numeric(10, 2), nullable=True)
    payment_method = Column(String(50), nullable=True)
    last_payment_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    member = relationship(Member, foreign_keys=[member_id])
    contents = relationship("SundaySchoolContent", back_populates="participant")
    created_by = relationship(User, foreign_keys=[created_by_id], backref="created_sunday_enrollments")
    updated_by = relationship(User, foreign_keys=[updated_by_id], backref="updated_sunday_enrollments")


class SundaySchoolContent(Base):
    __tablename__ = "sunday_school_contents"

    id = Column(Integer, primary_key=True)
    type = Column(SundayContentType, nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)
    file_path = Column(String(500), nullable=True)
    participant_id = Column(Integer, ForeignKey("sunday_school_enrollments.id", ondelete="SET NULL"), nullable=True)
    status = Column(SundayContentStatus, nullable=False, default="Draft")
    published = Column(Boolean, nullable=False, default=False)
    rejection_reason = Column(Text, nullable=True)
    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    participant = relationship("SundaySchoolEnrollment", back_populates="contents")
    approved_by = relationship(User, foreign_keys=[approved_by_id])
    created_by = relationship(User, foreign_keys=[created_by_id], backref="created_sunday_contents")
    updated_by = relationship(User, foreign_keys=[updated_by_id], backref="updated_sunday_contents")


class SundaySchoolAuditLog(Base):
    __tablename__ = "sunday_school_audit_logs"

    id = Column(Integer, primary_key=True)
    entity_type = Column(String(32), nullable=False)
    entity_id = Column(Integer, nullable=False)
    action = Column(String(120), nullable=False)
    detail = Column(Text, nullable=True)
    changes = Column(JSON, nullable=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    actor = relationship(User)


class AbenetEnrollmentPayment(Base):
    __tablename__ = "abenet_enrollment_payments"

    id = Column(Integer, primary_key=True)
    enrollment_id = Column(Integer, ForeignKey("abenet_enrollments.id", ondelete="CASCADE"), nullable=False)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, unique=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    enrollment = relationship(AbenetEnrollment, back_populates="payments")
    payment = relationship(Payment)
