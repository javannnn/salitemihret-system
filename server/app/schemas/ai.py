from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


AICapabilityStatus = Literal["planned", "pilot", "enabled"]
AIReportQAModule = Literal["members", "payments", "sponsorships", "newcomers", "schools", "activity"]


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


class AIReportQAHistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AIReportQARequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    start_date: date | None = None
    end_date: date | None = None
    modules: list[AIReportQAModule] = Field(default_factory=list, max_length=6)
    history: list[AIReportQAHistoryMessage] = Field(default_factory=list, max_length=12)
    include_visualization: bool = True
    allow_broader_system_context: bool = False


class AIReportSourceMetric(BaseModel):
    label: str
    value: str


class AIReportSourceRead(BaseModel):
    id: str
    module: AIReportQAModule
    title: str
    summary: str
    metrics: list[AIReportSourceMetric] = Field(default_factory=list)


class AIReportChartDatum(BaseModel):
    label: str
    value: float


class AIReportChartRead(BaseModel):
    type: Literal["bar", "pie"]
    title: str
    description: str | None = None
    unit: Literal["count", "currency", "percent"] = "count"
    data: list[AIReportChartDatum] = Field(default_factory=list)


class AIReportConfirmationRead(BaseModel):
    mode: Literal["broader_system_context"]
    title: str
    message: str
    original_question: str
    confirm_label: str = "Continue"
    cancel_label: str = "Stay in reports"
    estimated_wait_seconds: int | None = None


class AIReportAnswerResponse(BaseModel):
    task: str
    provider: str
    model: str
    status: Literal["answered", "confirmation_required"] = "answered"
    answer: str
    warnings: list[str] = Field(default_factory=list)
    sources: list[AIReportSourceRead] = Field(default_factory=list)
    chart: AIReportChartRead | None = None
    confirmation: AIReportConfirmationRead | None = None
    applied_modules: list[AIReportQAModule] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    requires_human_review: bool = False
    preview_only: bool = True
