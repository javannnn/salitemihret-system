from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from app.core.db import Base


class Priest(Base):
    __tablename__ = "priests"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(150), unique=True, nullable=False)
    phone = Column(String(50), nullable=True)
    email = Column(String(120), nullable=True)
    status = Column(String(50), nullable=False, default="Active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    members = relationship("Member", back_populates="father_confessor")
