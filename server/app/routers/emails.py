from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.deps import require_super_admin
from app.schemas.email import EmailInboxResponse, EmailMessageDetail, EmailMessageSummary, SendEmailRequest
from app.services import email_client
from app.core.db import get_db
from app.models.member import Member, Child
from app.core.config import settings

router = APIRouter(prefix="/emails", tags=["emails"])

def _resolve_imap_folder(folder: str | None) -> str:
    if not folder:
        return settings.EMAIL_IMAP_FOLDER
    normalized = folder.strip().lower()
    if normalized == "inbox":
        return settings.EMAIL_IMAP_FOLDER
    if normalized == "sent":
        return settings.EMAIL_IMAP_SENT_FOLDER
    if normalized == "drafts":
        return settings.EMAIL_IMAP_DRAFTS_FOLDER
    if normalized == "trash":
        return settings.EMAIL_IMAP_TRASH_FOLDER
    return folder


@router.get("", response_model=EmailInboxResponse)
def list_emails(
    limit: int = Query(default=25, ge=1, le=100),
    folder: str | None = Query(
        default=None,
        description="IMAP folder name or alias (inbox, sent, drafts, trash)",
    ),
    _: object = Depends(require_super_admin),
) -> EmailInboxResponse:
    folder_name = _resolve_imap_folder(folder)
    items = email_client.list_inbox(limit=limit, folder=folder_name)
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
    folder: str | None = Query(
        default=None,
        description="IMAP folder name or alias (inbox, sent, drafts, trash)",
    ),
    _: object = Depends(require_super_admin),
) -> EmailMessageDetail:
    folder_name = _resolve_imap_folder(folder)
    detail = email_client.get_message(uid, folder=folder_name)
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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: object = Depends(require_super_admin),
) -> dict[str, object]:
    try:
        print("DEBUG: send_email entered")
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
            recipients = [str(email) for (email,) in query.all() if email]
        else:
            recipients = [str(r) for r in payload.to]

        if not recipients:
            recipients = getattr(settings, "EMAIL_FALLBACK_RECIPIENTS_LIST", []) or []
        if not recipients and not payload.cc and not payload.bcc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one recipient is required")

        # Serialize attachments
        try:
            attachments_data = [att.model_dump() for att in payload.attachments]
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Attachment error: {str(e)}")

        background_tasks.add_task(
            _send_email_task,
            subject=payload.subject,
            to=recipients,
            cc=[str(c) for c in payload.cc],
            bcc=[str(b) for b in payload.bcc],
            body_html=payload.body_html,
            body_text=payload.body_text,
            reply_to=str(payload.reply_to) if payload.reply_to else None,
            attachments=attachments_data,
        )

        print(f"DEBUG: send_email success, recipients={len(recipients)}")
        return {"status": "accepted", "refused": []}
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: send_email error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Internal Error: {str(e)}")


def _send_email_task(
    subject: str,
    to: list[str],
    cc: list[str] | None,
    bcc: list[str] | None,
    body_html: str | None,
    body_text: str | None,
    reply_to: str | None,
    attachments: list[dict],
) -> None:
    email_client.send_email(
        subject=subject,
        to=to,
        cc=cc,
        bcc=bcc,
        body_html=body_html,
        body_text=body_text,
        reply_to=reply_to,
        attachments=attachments,
    )
