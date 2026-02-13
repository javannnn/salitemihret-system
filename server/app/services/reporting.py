from __future__ import annotations

from datetime import date, datetime, time
from typing import Iterable, List

from sqlalchemy.orm import Session, selectinload

from app.models.member_audit import MemberAudit
from app.models.sponsorship_audit import SponsorshipStatusAudit
from app.models.user import UserAuditLog
from app.schemas.reports import ReportActivityItem


def _range_bounds(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    start_dt = datetime.combine(start, time.min) if start else None
    end_dt = datetime.combine(end, time.max) if end else None
    return start_dt, end_dt


def _actor_name(actor) -> str | None:
    if not actor:
        return None
    return actor.full_name or actor.username or actor.email


def _member_activity(entries: Iterable[MemberAudit]) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in entries:
        actor = _actor_name(entry.actor)
        member_name = entry.member.full_name if entry.member else None
        if entry.field == "child_promoted":
            items.append(
                ReportActivityItem(
                    id=f"member:{entry.id}",
                    category="promotion",
                    action="Child promoted",
                    actor=actor,
                    target=entry.old_value or member_name,
                    detail=entry.new_value,
                    occurred_at=entry.changed_at,
                    entity_type="member",
                    entity_id=entry.member_id,
                )
            )
            continue
        if entry.field == "origin" and entry.new_value and "Promoted from child" in entry.new_value:
            items.append(
                ReportActivityItem(
                    id=f"member:{entry.id}",
                    category="promotion",
                    action="Child promoted",
                    actor=actor,
                    target=member_name,
                    detail=entry.new_value,
                    occurred_at=entry.changed_at,
                    entity_type="member",
                    entity_id=entry.member_id,
                )
            )
            continue
        if entry.field == "status":
            items.append(
                ReportActivityItem(
                    id=f"member:{entry.id}",
                    category="member",
                    action="Status changed",
                    actor=actor,
                    target=member_name,
                    detail=f"{entry.old_value or '—'} → {entry.new_value or '—'}",
                    occurred_at=entry.changed_at,
                    entity_type="member",
                    entity_id=entry.member_id,
                )
            )
            continue
        if entry.field == "deleted_at":
            items.append(
                ReportActivityItem(
                    id=f"member:{entry.id}",
                    category="member",
                    action="Archived" if entry.new_value else "Restored",
                    actor=actor,
                    target=member_name,
                    detail=None,
                    occurred_at=entry.changed_at,
                    entity_type="member",
                    entity_id=entry.member_id,
                )
            )
            continue
    return items


def _sponsorship_activity(entries: Iterable[SponsorshipStatusAudit]) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in entries:
        actor = _actor_name(entry.actor)
        target = entry.sponsorship.beneficiary_name if entry.sponsorship else None
        detail = None
        if entry.from_status or entry.to_status:
            detail = f"{entry.from_status or '—'} → {entry.to_status or '—'}"
        action = entry.action.value if hasattr(entry.action, "value") else str(entry.action)
        items.append(
            ReportActivityItem(
                id=f"sponsorship:{entry.id}",
                category="sponsorship",
                action=action or "Status change",
                actor=actor,
                target=target,
                detail=detail,
                occurred_at=entry.changed_at,
                entity_type="sponsorship",
                entity_id=entry.sponsorship_id,
            )
        )
    return items


def _user_activity(entries: Iterable[UserAuditLog]) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in entries:
        actor = _actor_name(entry.actor)
        target = entry.target_user.full_name or entry.target_user.username or entry.target_user.email
        items.append(
            ReportActivityItem(
                id=f"user:{entry.id}",
                category="user",
                action=entry.action.value if hasattr(entry.action, "value") else str(entry.action),
                actor=actor,
                target=target,
                detail=None,
                occurred_at=entry.created_at,
                entity_type="user",
                entity_id=entry.target_user_id,
            )
        )
    return items


def get_report_activity(
    db: Session,
    *,
    limit: int = 25,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[ReportActivityItem]:
    start_dt, end_dt = _range_bounds(start_date, end_date)

    member_query = (
        db.query(MemberAudit)
        .options(selectinload(MemberAudit.actor), selectinload(MemberAudit.member))
        .filter(MemberAudit.field.in_(["child_promoted", "origin", "status", "deleted_at"]))
        .order_by(MemberAudit.changed_at.desc())
    )
    if start_dt:
        member_query = member_query.filter(MemberAudit.changed_at >= start_dt)
    if end_dt:
        member_query = member_query.filter(MemberAudit.changed_at <= end_dt)
    member_entries = member_query.limit(limit).all()

    sponsorship_query = (
        db.query(SponsorshipStatusAudit)
        .options(selectinload(SponsorshipStatusAudit.actor), selectinload(SponsorshipStatusAudit.sponsorship))
        .order_by(SponsorshipStatusAudit.changed_at.desc())
    )
    if start_dt:
        sponsorship_query = sponsorship_query.filter(SponsorshipStatusAudit.changed_at >= start_dt)
    if end_dt:
        sponsorship_query = sponsorship_query.filter(SponsorshipStatusAudit.changed_at <= end_dt)
    sponsorship_entries = sponsorship_query.limit(limit).all()

    user_query = (
        db.query(UserAuditLog)
        .options(selectinload(UserAuditLog.actor), selectinload(UserAuditLog.target_user))
        .order_by(UserAuditLog.created_at.desc())
    )
    if start_dt:
        user_query = user_query.filter(UserAuditLog.created_at >= start_dt)
    if end_dt:
        user_query = user_query.filter(UserAuditLog.created_at <= end_dt)
    user_entries = user_query.limit(limit).all()

    items = _member_activity(member_entries) + _sponsorship_activity(sponsorship_entries) + _user_activity(user_entries)
    items.sort(key=lambda item: item.occurred_at, reverse=True)
    return items[:limit]
