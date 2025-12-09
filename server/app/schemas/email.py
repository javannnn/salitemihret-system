from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field


class EmailAttachment(BaseModel):
    filename: str
    content_base64: str
    content_type: Optional[str] = None


class EmailMessageSummary(BaseModel):
    uid: str
    subject: str
    sender: str
    date: datetime | None = None
    snippet: str
    has_html: bool
    has_attachments: bool


class EmailInboxResponse(BaseModel):
    items: List[EmailMessageSummary]


class EmailMessageDetail(BaseModel):
    uid: str
    subject: str
    sender: str
    to: list[str]
    cc: list[str]
    date: datetime | None = None
    text_body: str
    html_body: str | None = None
    headers: dict[str, str]
    has_attachments: bool


class SendEmailRequest(BaseModel):
    to: list[EmailStr] = Field(default_factory=list)
    cc: list[EmailStr] = Field(default_factory=list)
    bcc: list[EmailStr] = Field(default_factory=list)
    subject: str
    body_text: str | None = None
    body_html: str | None = None
    reply_to: EmailStr | None = None
    audience: str | None = Field(
        default=None,
        description="Optional audience filter: all_members, active_members, missing_phone, with_children, new_this_month",
    )
    attachments: list[EmailAttachment] = Field(default_factory=list)
