from __future__ import annotations

import logging
from typing import Any

from app.models.member import Child, Member

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
