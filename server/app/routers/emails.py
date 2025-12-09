from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_super_admin
from app.schemas.email import EmailInboxResponse, EmailMessageDetail, EmailMessageSummary, SendEmailRequest
from app.services import email_client
from app.core.db import get_db
from app.models.member import Member, Child
from app.core.config import settings

router = APIRouter(prefix="/emails", tags=["emails"])


@router.get("", response_model=EmailInboxResponse)
def list_emails(
    limit: int = Query(default=25, ge=1, le=100),
    folder: str | None = Query(default=None, description="IMAP folder name (e.g., INBOX, INBOX.Sent)"),
    _: object = Depends(require_super_admin),
) -> EmailInboxResponse:
    items = email_client.list_inbox(limit=limit, folder=folder)
    summaries: list[EmailMessageSummary] = []
    for item in items:
        summaries.append(
            EmailMessageSummary(
                uid=item.uid,
                subject=item.subject or "(no subject)",
                sender=item.sender or "(unknown sender)",
                date=item.date,
                snippet=item.snippet,
                has_html=item.has_html,
                has_attachments=item.has_attachments,
            )
        )
    return EmailInboxResponse(items=summaries)


@router.get("/{uid}", response_model=EmailMessageDetail)
def get_email(
    uid: str,
    folder: str | None = Query(default=None, description="IMAP folder name (e.g., INBOX, INBOX.Sent)"),
    _: object = Depends(require_super_admin),
) -> EmailMessageDetail:
    detail = email_client.get_message(uid, folder=folder)
    return EmailMessageDetail(
        uid=detail.uid,
        subject=detail.subject or "(no subject)",
        sender=detail.sender or "(unknown sender)",
        to=detail.to,
        cc=detail.cc,
        date=detail.date,
        text_body=detail.text_body or "",
        html_body=detail.html_body,
        headers=detail.headers,
        has_attachments=detail.has_attachments,
    )


@router.post("/send", status_code=status.HTTP_202_ACCEPTED)
def send_email(
    payload: SendEmailRequest,
    db: Session = Depends(get_db),
    _: object = Depends(require_super_admin),
) -> dict[str, str]:
    recipients: list[str] = []
    if payload.audience:
        audience = payload.audience
        now = datetime.now(timezone.utc)
        if audience == "all_members":
            query = db.query(Member.email).filter(Member.email.isnot(None), func.length(func.trim(Member.email)) > 0)
        elif audience == "active_members":
            query = (
                db.query(Member.email)
                .filter(
                    Member.status == "Active",
                    Member.email.isnot(None),
                    func.length(func.trim(Member.email)) > 0,
                )
            )
        elif audience == "missing_phone":
            query = (
                db.query(Member.email)
                .filter(
                    (Member.phone.is_(None) | (func.length(func.trim(func.coalesce(Member.phone, ""))) == 0)),
                    Member.email.isnot(None),
                    func.length(func.trim(Member.email)) > 0,
                )
            )
        elif audience == "with_children":
            query = (
                db.query(Member.email)
                .join(Child, Child.member_id == Member.id)
                .filter(
                    Child.promoted_at.is_(None),
                    Member.email.isnot(None),
                    func.length(func.trim(Member.email)) > 0,
                )
                .distinct()
            )
        elif audience == "new_this_month":
            start_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            query = (
                db.query(Member.email)
                .filter(
                    Member.created_at >= start_month,
                    Member.email.isnot(None),
                    func.length(func.trim(Member.email)) > 0,
                )
            )
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown audience filter")
        recipients = [email for (email,) in query.all() if email]
    else:
        recipients = payload.to

    if not recipients:
        recipients = getattr(settings, "EMAIL_FALLBACK_RECIPIENTS_LIST", []) or []
    if not recipients and not payload.cc and not payload.bcc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one recipient is required")
    sent, refused = email_client.send_email(
        subject=payload.subject,
        to=recipients,
        cc=payload.cc,
        bcc=payload.bcc,
        body_html=payload.body_html,
        body_text=payload.body_text,
        reply_to=payload.reply_to,
        attachments=[att.model_dump() for att in payload.attachments],
    )
    if not sent and not refused:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send email")
    if not sent and refused:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "All recipients were rejected", "refused": refused},
        )
    return {"status": "sent", "refused": refused}
