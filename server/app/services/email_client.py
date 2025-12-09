from __future__ import annotations

import email
from email import policy
import imaplib
from dataclasses import dataclass
from datetime import datetime
from email.header import decode_header, make_header
from email.message import EmailMessage
from typing import Iterable, List, Tuple

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.email_sender import get_email_sender


@dataclass
class EmailSummary:
    uid: str
    subject: str
    sender: str
    date: datetime | None
    snippet: str
    has_html: bool
    has_attachments: bool


@dataclass
class EmailDetail:
    uid: str
    subject: str
    sender: str
    to: list[str]
    cc: list[str]
    date: datetime | None
    text_body: str
    html_body: str | None
    headers: dict[str, str]
    has_attachments: bool


def _decode(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except Exception:
        return value


def _connect_imap() -> imaplib.IMAP4:
    host = settings.EMAIL_IMAP_HOST
    username = settings.EMAIL_IMAP_USERNAME
    password = settings.EMAIL_IMAP_PASSWORD
    if not (host and username and password):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email inbox not configured")
    if settings.EMAIL_IMAP_USE_SSL:
        client = imaplib.IMAP4_SSL(host, settings.EMAIL_IMAP_PORT)
    else:
        client = imaplib.IMAP4(host, settings.EMAIL_IMAP_PORT)
        if settings.EMAIL_IMAP_USE_TLS:
            client.starttls()
    client.login(username, password)
    return client


def _get_bodies(msg: email.message.EmailMessage) -> Tuple[str, str | None, bool]:
    text = ""
    html = None
    has_attachments = False
    if msg.is_multipart():
        for part in msg.walk():
            content_disposition = part.get("Content-Disposition", "")
            if content_disposition and "attachment" in content_disposition.lower():
                has_attachments = True
                continue
            content_type = part.get_content_type()
            charset = part.get_content_charset() or "utf-8"
            try:
                payload = part.get_payload(decode=True) or b""
                decoded = payload.decode(charset, errors="replace")
            except Exception:
                decoded = ""
            if content_type == "text/plain" and not text:
                text = decoded.strip()
            elif content_type == "text/html" and html is None:
                html = decoded
    else:
        content_type = msg.get_content_type()
        charset = msg.get_content_charset() or "utf-8"
        try:
            payload = msg.get_payload(decode=True) or b""
            decoded = payload.decode(charset, errors="replace")
        except Exception:
            decoded = ""
        if content_type == "text/html":
            html = decoded
        else:
            text = decoded.strip()
    return text, html, has_attachments


def list_inbox(limit: int = 25, folder: str | None = None) -> list[EmailSummary]:
    try:
        client = _connect_imap()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to connect to inbox")
    try:
        folder_name = folder or settings.EMAIL_IMAP_FOLDER
        status_ok, _ = client.select(folder_name)
        if status_ok != "OK":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to open mailbox")
        result, data = client.search(None, "ALL")
        if result != "OK" or not data or not data[0]:
            return []
        ids = data[0].split()
        selected = ids[-limit:]
        summaries: list[EmailSummary] = []
        for uid in reversed(selected):
            fetch_result, msg_data = client.fetch(uid, "(RFC822)")
            if fetch_result != "OK" or not msg_data or not msg_data[0]:
                continue
            _, raw = msg_data[0]
            msg = email.message_from_bytes(raw, policy=policy.default)
            text_body, html_body, has_attachments = _get_bodies(msg)
            snippet_source = text_body or (html_body or "").replace("<", " ").replace(">", " ")
            snippet = " ".join(snippet_source.split())[:240]
            summaries.append(
                EmailSummary(
                    uid=uid.decode(),
                    subject=_decode(msg.get("Subject")),
                    sender=_decode(msg.get("From")),
                    date=msg["Date"].datetime if msg["Date"] else None,  # type: ignore[union-attr]
                    snippet=snippet,
                    has_html=html_body is not None,
                    has_attachments=has_attachments,
                )
            )
        return summaries
    finally:
        try:
            client.logout()
        except Exception:
            pass


def get_message(uid: str, *, folder: str | None = None) -> EmailDetail:
    try:
        client = _connect_imap()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Unable to connect to inbox")
    try:
        folder_name = folder or settings.EMAIL_IMAP_FOLDER
        status_ok, _ = client.select(folder_name)
        if status_ok != "OK":
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to open mailbox")
        fetch_result, msg_data = client.fetch(uid, "(RFC822)")
        if fetch_result != "OK" or not msg_data or not msg_data[0]:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
        _, raw = msg_data[0]
        msg: EmailMessage = email.message_from_bytes(raw, policy=policy.default)
        text_body, html_body, has_attachments = _get_bodies(msg)
        headers = {key: _decode(value) for key, value in msg.items()}
        return EmailDetail(
            uid=uid,
            subject=_decode(msg.get("Subject")),
            sender=_decode(msg.get("From")),
            to=[_decode(value) for value in msg.get_all("To", [])],
            cc=[_decode(value) for value in msg.get_all("Cc", [])],
            date=msg["Date"].datetime if msg["Date"] else None,  # type: ignore[union-attr]
            text_body=text_body,
            html_body=html_body,
            headers=headers,
            has_attachments=has_attachments,
        )
    finally:
        try:
            client.logout()
        except Exception:
            pass


def send_email(
    *,
    subject: str,
    to: Iterable[str],
    body_html: str | None,
    body_text: str | None,
    cc: Iterable[str] | None = None,
    bcc: Iterable[str] | None = None,
    reply_to: str | None = None,
    attachments: list[dict] | None = None,
) -> tuple[bool, list[str]]:
    html = body_html or None
    text = body_text or ""
    if not html and text:
        html = f"<pre style=\"font-family: 'Inter', 'Segoe UI', sans-serif; white-space: pre-wrap;\">{text}</pre>"
    if not html and not text:
        text = "(no content)"
    sender = get_email_sender()
    return sender.send(
        subject=subject,
        html_body=html or text,
        text_body=text or "",
        to=list(to),
        cc=list(cc) if cc else None,
        bcc=list(bcc) if bcc else None,
        reply_to=reply_to,
        attachments=attachments,
    )
