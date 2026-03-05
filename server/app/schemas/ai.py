from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


AICapabilityStatus = Literal["planned", "pilot", "enabled"]


class AICapabilityRead(BaseModel):
    slug: str
    label: str
    module: str
    description: str
    status: AICapabilityStatus
    enabled: bool
    requires_human_review: bool = True
    allowed_roles: list[str] = Field(default_factory=list)
    recommended_model: str | None = None


class AIStatusRead(BaseModel):
    enabled: bool
    provider: str
    default_chat_model: str | None = None
    embedding_model: str | None = None
    guard_model: str | None = None
    ocr_model: str | None = None
    base_url_configured: bool = False
    allowed_roles: list[str] = Field(default_factory=list)
    capabilities: list[AICapabilityRead] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class NewcomerFollowUpDraftRequest(BaseModel):
    primary_contact_name: str = Field(min_length=1, max_length=120)
    household_name: str | None = Field(default=None, max_length=120)
    preferred_languages: list[str] = Field(default_factory=list, max_length=6)
    tone: Literal["warm", "formal", "pastoral"] = "warm"
    situation_summary: str = Field(min_length=20, max_length=4000)
    recent_notes: list[str] = Field(default_factory=list, max_length=8)
    missing_fields: list[str] = Field(default_factory=list, max_length=8)
    next_steps: list[str] = Field(default_factory=list, max_length=8)
    include_subject_line: bool = True


class AIDraftResponse(BaseModel):
    task: str
    provider: str
    model: str
    subject: str | None = None
    content: str
    warnings: list[str] = Field(default_factory=list)
    requires_human_review: bool = True
    preview_only: bool = True
