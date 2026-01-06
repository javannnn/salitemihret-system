from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class StaffSummary(BaseModel):
    id: int
    email: str
    username: str
    full_name: Optional[str]
    roles: list[str]


class StaffListResponse(BaseModel):
    items: list[StaffSummary]
    total: int
