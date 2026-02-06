from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.core.db import Base


class VolunteerGroup(Base):
    __tablename__ = "volunteer_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False, unique=True)
    team_lead_first_name = Column(String(100), nullable=True)
    team_lead_last_name = Column(String(100), nullable=True)
    team_lead_phone = Column(String(40), nullable=True)
    team_lead_email = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    workers = relationship(
        "VolunteerWorker",
        back_populates="group",
        cascade="all, delete-orphan",
        order_by="VolunteerWorker.service_date.desc(), VolunteerWorker.id.desc()",
    )
