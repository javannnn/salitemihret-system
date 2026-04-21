from __future__ import annotations

import email
from email import policy
import imaplib
from dataclasses import dataclass
from datetime import datetime
from email.header import decode_header, make_header
from email.message import EmailMessage
from functools import lru_cache
from typing import Iterable, List, Tuple

import dns.resolver
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


@dataclass
class InboxStatus:
    state: str
    configured: bool
    inbox_accessible: bool
    inbound_ready: bool
    mailbox_address: str | None
    mailbox_domain: str | None
    imap_host: str | None
    imap_port: int | None
    public_mx_hosts: list[str]
    summary: str
    details: str | None


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


def _mailbox_address() -> str | None:
    return settings.EMAIL_FROM_ADDRESS or settings.EMAIL_IMAP_USERNAME


def _mailbox_domain() -> str | None:
    mailbox_address = _mailbox_address()
    if mailbox_address and "@" in mailbox_address:
        return mailbox_address.split("@", 1)[1].strip().lower()
    return None


def _normalize_host(value: str | None) -> str:
    return (value or "").strip().lower().rstrip(".")


def _provider_key(host: str | None) -> str:
    normalized = _normalize_host(host)
    if not normalized:
        return ""
    labels = normalized.split(".")
    if len(labels) < 2:
        return normalized
    return ".".join(labels[-2:])


def _shares_mail_provider(host: str | None, other: str | None) -> bool:
    left = _provider_key(host)
    right = _provider_key(other)
    return bool(left and right and left == right)


@lru_cache(maxsize=32)
def _lookup_public_mx_hosts(domain: str) -> tuple[str, ...]:
    answers = dns.resolver.resolve(domain, "MX", lifetime=3.0)
    prioritized = sorted(
        (
            (int(getattr(answer, "preference", 0)), _normalize_host(str(getattr(answer, "exchange", ""))))
            for answer in answers
        ),
        key=lambda item: (item[0], item[1]),
    )
    return tuple(host for _, host in prioritized if host)


def get_inbox_status() -> InboxStatus:
    configured = bool(
        settings.EMAIL_IMAP_HOST
        and settings.EMAIL_IMAP_USERNAME
        and settings.EMAIL_IMAP_PASSWORD
    )
    mailbox_address = _mailbox_address()
    mailbox_domain = _mailbox_domain()
    imap_host = _normalize_host(settings.EMAIL_IMAP_HOST)
    imap_port = settings.EMAIL_IMAP_PORT if settings.EMAIL_IMAP_HOST else None

    if not configured:
        return InboxStatus(
            state="unconfigured",
            configured=False,
            inbox_accessible=False,
            inbound_ready=False,
            mailbox_address=mailbox_address,
            mailbox_domain=mailbox_domain,
            imap_host=imap_host or None,
            imap_port=imap_port,
            public_mx_hosts=[],
            summary="Inbound email is not configured for this installation.",
            details="Set the IMAP inbox credentials and mailbox address before using the admin email inbox.",
        )

    inbox_accessible = False
    client: imaplib.IMAP4 | None = None
    try:
        client = _connect_imap()
        inbox_accessible = True
    except HTTPException:
        inbox_accessible = False
    except Exception:
        inbox_accessible = False
    finally:
        try:
            if client is not None:
                client.logout()
        except Exception:
            pass

    public_mx_hosts: list[str] = []
    mx_lookup_succeeded = False
    if mailbox_domain:
        try:
            public_mx_hosts = list(_lookup_public_mx_hosts(mailbox_domain))
            mx_lookup_succeeded = True
        except Exception:
            mx_lookup_succeeded = False

    if not inbox_accessible:
        return InboxStatus(
            state="imap_unreachable",
            configured=True,
            inbox_accessible=False,
            inbound_ready=False,
            mailbox_address=mailbox_address,
            mailbox_domain=mailbox_domain,
            imap_host=imap_host or None,
            imap_port=imap_port,
            public_mx_hosts=public_mx_hosts,
            summary=f"The app could not log in to the configured inbox on {imap_host or 'the IMAP host'}.",
            details="Verify the IMAP hostname, port, mailbox password, and SSL/TLS settings.",
        )

    mx_aligned = True
    if mx_lookup_succeeded and public_mx_hosts and imap_host:
        mx_aligned = any(
            imap_host == mx_host or _shares_mail_provider(imap_host, mx_host)
            for mx_host in public_mx_hosts
        )

    if mx_lookup_succeeded and public_mx_hosts and not mx_aligned:
        mx_list = ", ".join(public_mx_hosts)
        return InboxStatus(
            state="mx_mismatch",
            configured=True,
            inbox_accessible=True,
            inbound_ready=False,
            mailbox_address=mailbox_address,
            mailbox_domain=mailbox_domain,
            imap_host=imap_host or None,
            imap_port=imap_port,
            public_mx_hosts=public_mx_hosts,
            summary=(
                f"Public mail for {mailbox_domain} routes to {mx_list}, but this inbox is connected to {imap_host}."
            ),
            details=(
                "Messages sent from outside follow the public MX records first. Create the mailbox on that "
                "provider or repoint the domain MX records to the host used by this inbox."
            ),
        )

    if mx_lookup_succeeded:
        return InboxStatus(
            state="ready",
            configured=True,
            inbox_accessible=True,
            inbound_ready=True,
            mailbox_address=mailbox_address,
            mailbox_domain=mailbox_domain,
            imap_host=imap_host or None,
            imap_port=imap_port,
            public_mx_hosts=public_mx_hosts,
            summary="Inbound mail is aligned with the connected inbox and the mailbox is reachable.",
            details="New messages sent to this mailbox should arrive in the admin inbox.",
        )

    return InboxStatus(
        state="mx_unverified",
        configured=True,
        inbox_accessible=True,
        inbound_ready=True,
        mailbox_address=mailbox_address,
        mailbox_domain=mailbox_domain,
        imap_host=imap_host or None,
        imap_port=imap_port,
        public_mx_hosts=[],
        summary="The mailbox is reachable, but the server could not verify the public MX records just now.",
        details="Inbound mail may still work, but public routing could not be confirmed from the app server.",
    )


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
