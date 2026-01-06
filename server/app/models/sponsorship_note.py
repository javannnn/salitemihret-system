from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import relationship

from app.core.db import Base


class SponsorshipNote(Base):
    __tablename__ = "sponsorship_notes"

    id = Column(Integer, primary_key=True)
    sponsorship_id = Column(Integer, ForeignKey("sponsorships.id", ondelete="CASCADE"), nullable=False, index=True)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    sponsorship = relationship("Sponsorship", back_populates="internal_notes")
    author = relationship("User", foreign_keys=[created_by_id])
