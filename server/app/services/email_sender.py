from __future__ import annotations

import base64
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr, format_datetime, make_msgid
import imaplib
from datetime import datetime, timezone
from typing import Iterable, Sequence, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)


def _clean_recipients(recipients: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    placeholder_domains = {"example.com", "example.org", "example.net"}
    for address in recipients:
        if not address:
            continue
        normalized = address.strip()
        if not normalized or "@" not in normalized:
            continue
        domain = normalized.split("@")[-1].lower()
        if domain in placeholder_domains:
            continue
        cleaned.append(normalized)
    return list(dict.fromkeys(cleaned))


class EmailSender:
    def __init__(self) -> None:
        self.from_address = settings.EMAIL_FROM_ADDRESS
        self.from_name = settings.EMAIL_FROM_NAME
        self.reply_to = settings.EMAIL_REPLY_TO

    def is_configured(self) -> bool:
        return bool(
            self.from_address
            and settings.EMAIL_SMTP_HOST
            and settings.EMAIL_SMTP_USERNAME
            and settings.EMAIL_SMTP_PASSWORD
        )

    def send(
        self,
        *,
        subject: str,
        html_body: str,
        text_body: str,
        to: Sequence[str],
        cc: Sequence[str] | None = None,
        bcc: Sequence[str] | None = None,
        reply_to: str | None = None,
        attachments: Sequence[dict] | None = None,
    ) -> Tuple[bool, list[str]]:
        to_clean = _clean_recipients(to)
        cc_clean = _clean_recipients(cc or [])
        bcc_clean = _clean_recipients(bcc or [])
        all_recipients = list(dict.fromkeys(to_clean + cc_clean + bcc_clean))

        if not all_recipients:
            logger.warning("email_send_skipped_no_recipients", extra={"subject": subject})
            return False, []
        if not self.is_configured():
            logger.warning("email_send_skipped_unconfigured", extra={"subject": subject, "to": all_recipients})
            return False, []

        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = formataddr((self.from_name, self.from_address)) if self.from_address else None
        message["To"] = ", ".join(to_clean)
        if cc_clean:
            message["Cc"] = ", ".join(cc_clean)
        if reply_to or self.reply_to:
            message["Reply-To"] = reply_to or self.reply_to
        if "Date" not in message:
            message["Date"] = format_datetime(datetime.now(timezone.utc))
        if "Message-ID" not in message and self.from_address and "@" in self.from_address:
            domain = self.from_address.split("@", 1)[1]
            message["Message-ID"] = make_msgid(domain=domain)

        message.set_content(text_body or " ")
        message.add_alternative(html_body, subtype="html")
        for attachment in attachments or []:
            try:
                content = base64.b64decode(attachment.get("content_base64", ""), validate=True)
            except Exception:
                logger.warning("email_attachment_invalid", extra={"filename": attachment.get("filename")})
                continue
            content_type = attachment.get("content_type") or "application/octet-stream"
            if "/" in content_type:
                maintype, subtype = content_type.split("/", 1)
            else:
                maintype, subtype = "application", "octet-stream"
            filename = attachment.get("filename") or "attachment"
            message.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)

        try:
            if settings.EMAIL_SMTP_USE_SSL:
                with smtplib.SMTP_SSL(
                    settings.EMAIL_SMTP_HOST,
                    settings.EMAIL_SMTP_PORT,
                    timeout=settings.EMAIL_TIMEOUT_SECONDS,
                ) as smtp:
                    smtp.ehlo()
                    smtp.login(settings.EMAIL_SMTP_USERNAME, settings.EMAIL_SMTP_PASSWORD)
                    smtp.send_message(message, from_addr=self.from_address, to_addrs=all_recipients)
            else:
                with smtplib.SMTP(
                    settings.EMAIL_SMTP_HOST,
                    settings.EMAIL_SMTP_PORT,
                    timeout=settings.EMAIL_TIMEOUT_SECONDS,
                ) as smtp:
                    smtp.ehlo()
                    if settings.EMAIL_SMTP_USE_TLS:
                        smtp.starttls()
                        smtp.ehlo()
                    smtp.login(settings.EMAIL_SMTP_USERNAME, settings.EMAIL_SMTP_PASSWORD)
                    smtp.send_message(message, from_addr=self.from_address, to_addrs=all_recipients)
            self._append_to_sent(message)
            logger.info("email_sent", extra={"subject": subject, "to": all_recipients})
            return True, []
        except smtplib.SMTPRecipientsRefused as exc:
            refused = exc.recipients if hasattr(exc, "recipients") else {}
            logger.warning("email_recipients_refused", extra={"subject": subject, "refused": refused})
            accepted_count = len(all_recipients) - len(refused or {})
            if accepted_count > 0:
                return True, list(refused.keys())
            return False, list(refused.keys())
        except Exception:
            logger.exception("email_send_failed", extra={"subject": subject, "to": all_recipients})
            return False, []

    def _append_to_sent(self, message: EmailMessage) -> None:
        """Store a copy of the message in the IMAP Sent folder when credentials are available."""
        host = settings.EMAIL_IMAP_HOST
        username = settings.EMAIL_IMAP_USERNAME
        password = settings.EMAIL_IMAP_PASSWORD
        folder = settings.EMAIL_IMAP_SENT_FOLDER
        if not (host and username and password and folder):
            return
        try:
            if settings.EMAIL_IMAP_USE_SSL:
                client = imaplib.IMAP4_SSL(host, settings.EMAIL_IMAP_PORT)
            else:
                client = imaplib.IMAP4(host, settings.EMAIL_IMAP_PORT)
                if settings.EMAIL_IMAP_USE_TLS:
                    client.starttls()
            client.login(username, password)
            # Ignore select result; append will create folder on many servers if missing.
            client.append(folder, "\\Seen", None, message.as_bytes())
        except Exception:
            logger.warning("email_append_sent_failed", exc_info=True, extra={"folder": folder})
        finally:
            try:
                client.logout()  # type: ignore[func-returns-value]
            except Exception:
                pass


def get_email_sender() -> EmailSender:
    return EmailSender()
