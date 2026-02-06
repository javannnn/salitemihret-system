from __future__ import annotations

from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, Integer, UniqueConstraint

from app.core.db import Base


class SponsorshipBudgetRound(Base):
    __tablename__ = "sponsorship_budget_rounds"
    __table_args__ = (UniqueConstraint("year", "round_number", name="uq_sponsorship_budget_rounds_year_round"),)

    id = Column(Integer, primary_key=True)
    year = Column(Integer, nullable=False, index=True)
    round_number = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    slot_budget = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
