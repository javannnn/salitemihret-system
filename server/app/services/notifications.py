from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Sequence, Tuple
from urllib.parse import quote_plus

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.member import Child, Member
from app.models.sponsorship import Sponsorship
from app.models.payment import Payment
from app.models.payment_day_lock import PaymentDayLock
from app.models.role import Role
from app.models.user import User, UserInvitation
from app.services.email_sender import get_email_sender
from app.services import email_templates

logger = logging.getLogger(__name__)
BRAND_NAME = settings.EMAIL_FROM_NAME or "St. Mary EOTC Edmonton"


def _app_url(path: str = "") -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{base}{path}"


def _format_date(value: date | datetime | None) -> str:
    if value is None:
        return "Unknown"
    if isinstance(value, datetime):
        return value.strftime("%b %d, %Y %H:%M %Z") or value.isoformat()
    return value.strftime("%b %d, %Y")


def _get_child_notification_recipients(db: Session) -> list[str]:
    recipients: list[str] = []
    role_filter = getattr(settings, "CHILD_PROMOTION_NOTIFY_ROLES_LIST", []) or []
    if role_filter:
        rows = (
            db.query(User.email)
            .join(User.roles)
            .filter(User.is_active.is_(True), Role.name.in_(role_filter))
            .distinct()
            .all()
        )
        recipients.extend(email for (email,) in rows if email)
    super_admin_rows = (
        db.query(User.email)
        .filter(User.is_active.is_(True), User.is_super_admin.is_(True))
        .all()
    )
    recipients.extend(email for (email,) in super_admin_rows if email)
    recipients.extend(getattr(settings, "EMAIL_FALLBACK_RECIPIENTS_LIST", []) or [])
    # Deduplicate while preserving order
    return list(dict.fromkeys([email for email in recipients if email]))


def _get_sponsorship_notification_recipients(db: Session) -> list[str]:
    recipients: list[str] = []
    role_filter = getattr(settings, "SPONSORSHIP_REMINDER_NOTIFY_ROLES_LIST", []) or []
    if role_filter:
        rows = (
            db.query(User.email)
            .join(User.roles)
            .filter(User.is_active.is_(True), Role.name.in_(role_filter))
            .distinct()
            .all()
        )
        recipients.extend(email for (email,) in rows if email)
    super_admin_rows = (
        db.query(User.email)
        .filter(User.is_active.is_(True), User.is_super_admin.is_(True))
        .all()
    )
    recipients.extend(email for (email,) in super_admin_rows if email)
    recipients.extend(getattr(settings, "EMAIL_FALLBACK_RECIPIENTS_LIST", []) or [])
    return list(dict.fromkeys([email for email in recipients if email]))


def _format_amount(value: Decimal | float | int | None) -> str:
    if value is None:
        return "—"
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
        return f"${amount:,.2f}"
    except Exception:
        return str(value)


def _resolve_beneficiary_label(sponsorship: Sponsorship) -> str:
    if sponsorship.newcomer:
        return f"{sponsorship.newcomer.first_name} {sponsorship.newcomer.last_name}".strip()
    if sponsorship.beneficiary_member:
        return f"{sponsorship.beneficiary_member.first_name} {sponsorship.beneficiary_member.last_name}".strip()
    return sponsorship.beneficiary_name or "Unknown beneficiary"


def _build_whatsapp_message(
    *,
    sponsor_name: str,
    beneficiary_name: str,
    amount_text: str,
    frequency: str,
    brand_name: str,
    case_label: str,
) -> str:
    return (
        f"Hello {sponsor_name},\n"
        f"This is a reminder from {brand_name} about your sponsorship for {beneficiary_name}.\n"
        f"Pledge: {amount_text} ({frequency}).\n"
        f"Case: {case_label}\n"
        "Thank you for your support."
    )


def send_user_invitation_email(invitation: UserInvitation, token: str, invited_by: User | None) -> bool:
    invite_url = _app_url(f"/onboard?token={quote_plus(token)}")
    inviter_name = None
    if invited_by:
        inviter_name = invited_by.full_name or invited_by.email
    html_body, text_body = email_templates.render_invitation_email(
        invite_url=invite_url,
        token=token,
        expires_at=invitation.expires_at,
        invited_by=inviter_name,
        roles=invitation.roles_snapshot or [],
        message=invitation.message,
        invitee_email=invitation.email,
    )
    sender = get_email_sender()
    sent, _ = sender.send(
        subject=f"You're invited to the {BRAND_NAME} console",
        html_body=html_body,
        text_body=text_body,
        to=[invitation.email],
    )
    return sent


def send_password_reset_email(invitation: UserInvitation, token: str, requested_by: User | None) -> bool:
    reset_url = _app_url(f"/onboard?token={quote_plus(token)}")
    requester_name = None
    if requested_by:
        requester_name = requested_by.full_name or requested_by.email
    html_body, text_body = email_templates.render_password_reset_email(
        reset_url=reset_url,
        token=token,
        expires_at=invitation.expires_at,
        requested_by=requester_name,
        invitee_email=invitation.email,
    )
    sender = get_email_sender()
    sent, _ = sender.send(
        subject=f"Reset your {BRAND_NAME} access",
        html_body=html_body,
        text_body=text_body,
        to=[invitation.email],
    )
    return sent


def notify_child_turns_eighteen(db: Session, child: Child, parent: Member | None, new_member: Member) -> None:
    recipients = _get_child_notification_recipients(db)
    html_body, text_body = email_templates.render_child_promoted_email(
        child=child,
        parent=parent,
        new_member=new_member,
        member_url=_app_url(f"/members/{new_member.id}/edit"),
    )
    sent = False
    if recipients:
        sender = get_email_sender()
        sent, _ = sender.send(
            subject=f"{child.full_name} turned 18 and was promoted",
            html_body=html_body,
            text_body=text_body,
            to=recipients,
        )

    logger.info(
        "child_promoted_to_member",
        extra={
            "child_id": child.id,
            "child_name": child.full_name,
            "parent_member_id": parent.id if parent else None,
            "new_member_id": new_member.id,
            "email_sent": sent,
            "recipients": recipients,
        },
    )


def send_child_promotion_digest(db: Session, candidates: Sequence[Tuple[Child, date]]) -> bool:
    recipients = _get_child_notification_recipients(db)
    if not recipients or not candidates:
        logger.info(
            "child_promotion_digest_skipped",
            extra={"recipients": recipients, "total_candidates": len(candidates)},
        )
        return False

    items: list[dict[str, str]] = []
    for child, turns_on in candidates:
        parent = child.parent
        items.append(
            {
                "child_name": child.full_name,
                "turns_on": _format_date(turns_on),
                "parent_name": f"{parent.first_name} {parent.last_name}" if parent else "Unknown guardian",
                "household": parent.household.name if parent and parent.household else "–",
            }
        )

    html_body, text_body = email_templates.render_child_promotion_digest_email(
        items=items,
        lookahead_days=settings.CHILD_PROMOTION_DIGEST_LOOKAHEAD_DAYS,
        dashboard_url=_app_url("/members"),
    )
    sender = get_email_sender()
    sent, _ = sender.send(
        subject="Children approaching 18 (promotion digest)",
        html_body=html_body,
        text_body=text_body,
        to=recipients,
    )
    logger.info(
        "child_promotion_digest_dispatched",
        extra={
            "total_candidates": len(candidates),
            "recipients": recipients,
            "email_sent": sent,
        },
    )
    return sent


def send_sponsorship_reminder(db: Session, sponsorship: Sponsorship) -> None:
    sponsor = sponsorship.sponsor
    sponsor_name = (
        f"{sponsor.first_name} {sponsor.last_name}".strip() if sponsor else "Sponsor"
    )
    beneficiary_name = _resolve_beneficiary_label(sponsorship)
    amount_value = sponsorship.monthly_amount
    amount_text = _format_amount(amount_value)
    channel_text = sponsorship.reminder_channel or "Email"
    case_label = f"SP-{sponsorship.id:04d}"
    last_sent = _format_date(sponsorship.reminder_last_sent)
    next_due = _format_date(sponsorship.reminder_next_due)
    brand_name = BRAND_NAME
    whatsapp_message = _build_whatsapp_message(
        sponsor_name=sponsor_name,
        beneficiary_name=beneficiary_name,
        amount_text=amount_text,
        frequency=sponsorship.frequency or "Monthly",
        brand_name=brand_name,
        case_label=case_label,
    )

    admin_recipients = _get_sponsorship_notification_recipients(db)
    admin_sent = False
    sponsor_sent = False

    sender = get_email_sender()

    if admin_recipients:
        admin_html, admin_text = email_templates.render_sponsorship_admin_reminder_email(
            sponsor_name=sponsor_name,
            sponsor_email=getattr(sponsor, "email", None),
            sponsor_phone=getattr(sponsor, "phone", None),
            beneficiary_name=beneficiary_name,
            amount=amount_value,
            frequency=sponsorship.frequency or "Monthly",
            program=sponsorship.program,
            reminder_channel=channel_text,
            case_label=case_label,
            last_sent=last_sent,
            next_due=next_due,
            dashboard_url=_app_url(f"/sponsorships/{sponsorship.id}"),
            whatsapp_message=whatsapp_message,
        )
        admin_sent, _ = sender.send(
            subject=f"Sponsorship reminder sent ({case_label})",
            html_body=admin_html,
            text_body=admin_text,
            to=admin_recipients,
        )

    sponsor_email = getattr(sponsor, "email", None) if sponsor else None
    if sponsor_email:
        sponsor_html, sponsor_text = email_templates.render_sponsorship_reminder_email(
            sponsor_name=sponsor_name,
            beneficiary_name=beneficiary_name,
            amount=amount_value,
            frequency=sponsorship.frequency or "Monthly",
            program=sponsorship.program,
            reminder_channel=channel_text,
            case_label=case_label,
            last_sent=last_sent,
            next_due=next_due,
        )
        sponsor_sent, _ = sender.send(
            subject=f"Sponsorship reminder ({case_label})",
            html_body=sponsor_html,
            text_body=sponsor_text,
            to=[sponsor_email],
        )

    logger.info(
        "sponsorship_reminder_sent",
        extra={
            "sponsorship_id": sponsorship.id,
            "case_label": case_label,
            "admin_sent": admin_sent,
            "sponsor_sent": sponsor_sent,
            "reminder_channel": channel_text,
            "admin_recipients": admin_recipients,
            "sponsor_email": sponsor_email,
        },
    )


def notify_contribution_change(member: Member, field: str, previous: Any, current: Any) -> None:
    logger.info(
        "contribution_flag_changed",
        extra={
            "member_id": member.id,
            "member_username": member.username,
            "field": field,
            "old_value": previous,
            "new_value": current,
        },
    )


def notify_payment_overdue(payment: Payment) -> None:
    member = payment.member
    recipient = member.email if member and member.email else None
    recipients = [recipient] if recipient else getattr(settings, "EMAIL_FALLBACK_RECIPIENTS_LIST", []) or []
    pay_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/payments" if settings.FRONTEND_BASE_URL else None
    html_body, text_body = email_templates.render_payment_reminder_email(
        member_name=member.full_name if member else "Member",
        amount=f"{payment.amount:.2f}",
        currency=payment.currency or "CAD",
        due_date=payment.due_date.isoformat() if payment.due_date else None,
        service_label=payment.service_type.label if payment.service_type else "Payment",
        pay_url=pay_url,
    )
    sent = False
    if recipients:
        sender = get_email_sender()
        sent = sender.send(
            subject=f"Payment reminder: {payment.service_type.label if payment.service_type else 'Payment'}",
            html_body=html_body,
            text_body=text_body,
            to=recipients,
        )
    logger.warning(
        "payment_overdue",
        extra={
            "payment_id": payment.id,
            "member_id": payment.member_id,
            "service_type": payment.service_type.code if payment.service_type else None,
            "due_date": payment.due_date,
            "status": payment.status,
            "email_sent": sent,
            "recipients": recipients,
        },
    )


def notify_payment_day_locked(lock: PaymentDayLock) -> None:
    logger.info(
        "payment_day_locked",
        extra={
            "day": lock.day.isoformat(),
            "locked_by": lock.locked_by_id,
        },
    )


def notify_payment_day_unlocked(lock: PaymentDayLock) -> None:
    logger.info(
        "payment_day_unlocked",
        extra={
            "day": lock.day.isoformat(),
            "unlocked_by": lock.unlocked_by_id,
            "reason": lock.unlock_reason,
        },
    )
