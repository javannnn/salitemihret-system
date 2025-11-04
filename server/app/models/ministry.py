from __future__ import annotations

from sqlalchemy import Column, ForeignKey, Integer, String, Table, UniqueConstraint
from sqlalchemy.orm import relationship

from app.core.db import Base

member_ministries = Table(
    "member_ministries",
    Base.metadata,
    Column("member_id", ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
    Column("ministry_id", ForeignKey("ministries.id", ondelete="CASCADE"), primary_key=True),
    UniqueConstraint("member_id", "ministry_id", name="uq_member_ministry"),
)


class Ministry(Base):
    __tablename__ = "ministries"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)
    slug = Column(String(140), unique=True, nullable=False)

    members = relationship("Member", secondary=member_ministries, back_populates="ministries")
