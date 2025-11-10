from __future__ import annotations

import logging
from typing import Any

from app.models.member import Child, Member
from app.models.payment import Payment
from app.models.payment_day_lock import PaymentDayLock

logger = logging.getLogger(__name__)


def notify_child_turns_eighteen(child: Child, parent: Member | None, new_member: Member) -> None:
    """Placeholder notification when a child is promoted to member."""

    logger.info(
        "child_promoted_to_member",
        extra={
            "child_id": child.id,
            "child_name": child.full_name,
            "parent_member_id": parent.id if parent else None,
            "new_member_id": new_member.id,
        },
    )


def notify_contribution_change(member: Member, field: str, previous: Any, current: Any) -> None:
    """Placeholder hook for tithe/contribution approval workflow."""

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
    logger.warning(
        "payment_overdue",
        extra={
            "payment_id": payment.id,
            "member_id": payment.member_id,
            "service_type": payment.service_type.code if payment.service_type else None,
            "due_date": payment.due_date,
            "status": payment.status,
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
