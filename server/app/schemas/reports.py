from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ReportActivityItem(BaseModel):
    id: str
    category: Literal["promotion", "member", "sponsorship", "user"]
    action: str
    actor: str | None
    target: str | None
    detail: str | None
    occurred_at: datetime
    entity_type: str | None = None
    entity_id: int | None = None
