from __future__ import annotations

from sqlalchemy import Boolean, Column, Integer, JSON, String

from app.core.db import Base


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True)
    name = Column(String(64), unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    module_permissions = Column(JSON, nullable=True)
    field_permissions = Column(JSON, nullable=True)
