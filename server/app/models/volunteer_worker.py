from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.db import Base

VolunteerServiceType = Enum("Holiday", "GeneralService", name="volunteer_service_type")


class VolunteerWorker(Base):
    __tablename__ = "volunteer_workers"

    id = Column(Integer, primary_key=True)
    group_id = Column(Integer, ForeignKey("volunteer_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    phone = Column(String(40), nullable=True)
    service_type = Column(VolunteerServiceType, nullable=False)
    service_date = Column(Date, nullable=False, default=date.today)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    group = relationship("VolunteerGroup", back_populates="workers")
