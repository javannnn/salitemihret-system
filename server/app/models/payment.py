from __future__ import annotations

from datetime import datetime

from datetime import date

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base


class PaymentServiceType(Base):
    __tablename__ = "payment_service_types"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)
    label = Column(String(120), nullable=False)
    description = Column(String(255), nullable=True)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    payments = relationship("Payment", back_populates="service_type")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="CAD")
    method = Column(String(100), nullable=True)
    memo = Column(String(255), nullable=True)
    service_type_id = Column(Integer, ForeignKey("payment_service_types.id", ondelete="RESTRICT"), nullable=False)
    member_id = Column(Integer, ForeignKey("members.id", ondelete="SET NULL"), nullable=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id", ondelete="SET NULL"), nullable=True, index=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    posted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    due_date = Column(Date, nullable=True)
    status = Column(String(20), nullable=False, default="Completed")
    correction_of_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    correction_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    service_type = relationship("PaymentServiceType", back_populates="payments")
    member = relationship("Member")
    household = relationship("Household")
    recorded_by = relationship("User")
    correction_of = relationship("Payment", remote_side=[id], backref="corrections")
    receipts = relationship("PaymentReceipt", back_populates="payment", cascade="all, delete-orphan")


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"

    id = Column(Integer, primary_key=True)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, unique=True)
    reference_number = Column(String(120), nullable=True)
    attachment_path = Column(String(255), nullable=True)
    issued_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    payment = relationship("Payment", back_populates="receipts")
