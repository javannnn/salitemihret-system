from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LicenseStatusOut(BaseModel):
    state: str
    message: str
    expires_at: datetime | None
    trial_expires_at: datetime
    days_remaining: int
    customer: str | None = None


class LicenseActivateIn(BaseModel):
    token: str = Field(..., min_length=32)
