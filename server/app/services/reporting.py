from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Iterable, List

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.models.member_audit import MemberAudit
from app.models.newcomer import Newcomer
from app.models.newcomer_tracking import NewcomerInteraction, NewcomerStatusAudit
from app.models.sponsorship import Sponsorship
from app.models.sponsorship_audit import SponsorshipStatusAudit
from app.models.user import UserAuditLog
from app.schemas.reports import (
    NewcomerOwnerBreakdownItem,
    NewcomerReportCaseItem,
    NewcomerReportResponse,
    NewcomerReportSummary,
    ReportActivityItem,
    ReportBreakdownItem,
)

NEWCOMER_STATUS_FLOW: tuple[str, ...] = ("New", "Contacted", "Assigned", "InProgress", "Settled", "Closed")
LEGACY_NEWCOMER_STATUS_MAP = {"Sponsored": "InProgress", "Converted": "Closed"}
NEWCOMER_STALE_DAYS = 14
NEWCOMER_RECENT_DAYS = 30
FOLLOWUP_WINDOW_DAYS = 7
SPONSORSHIP_STATUS_ORDER: tuple[str, ...] = (
    "Draft",
    "Submitted",
    "Approved",
    "Active",
    "Suspended",
    "Completed",
    "Closed",
    "Rejected",
)


def _range_bounds(start: date | None, end: date | None) -> tuple[datetime | None, datetime | None]:
    start_dt = datetime.combine(start, time.min) if start else None
    end_dt = datetime.combine(end, time.max) if end else None
    return start_dt, end_dt


def _actor_name(actor) -> str | None:
    if not actor:
        return None
    return actor.full_name or actor.username or actor.email


def _normalize_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _member_name(member) -> str | None:
    if not member:
        return None
    name = " ".join(part.strip() for part in [member.first_name, member.last_name] if part and part.strip())
    return name or member.username or member.email


def _member_activity(entries: Iterable[MemberAudit]) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in entries:
        actor = _actor_name(entry.actor)
        member_name = _member_name(entry.member)
        if entry.field == "child_promoted":
            items.append(
                ReportActivityItem(
                    id=f"member:{entry.id}",
                    category="promotion",
                    action="Child promoted",
                    actor=actor,
                    target=entry.old_value or member_name,
                    detail=entry.new_value,
                    occurred_at=_normalize_timestamp(entry.changed_at),
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
                    occurred_at=_normalize_timestamp(entry.changed_at),
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
                    occurred_at=_normalize_timestamp(entry.changed_at),
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
                    occurred_at=_normalize_timestamp(entry.changed_at),
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
                occurred_at=_normalize_timestamp(entry.changed_at),
                entity_type="sponsorship",
                entity_id=entry.sponsorship_id,
            )
        )
    return items


def _newcomer_name(newcomer: Newcomer | None) -> str | None:
    if not newcomer:
        return None
    return newcomer.full_name or newcomer.newcomer_code


def _literal_value(value) -> str | None:
    if value is None:
        return None
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _normalize_newcomer_status(value: str | None) -> str:
    value = _literal_value(value)
    if value in NEWCOMER_STATUS_FLOW:
        return str(value)
    if value in LEGACY_NEWCOMER_STATUS_MAP:
        return LEGACY_NEWCOMER_STATUS_MAP[value]
    return "New"


def _status_audit_action_label(entry: NewcomerStatusAudit) -> str:
    action = entry.action.value if hasattr(entry.action, "value") else str(entry.action)
    return {
        "StatusChange": "Status changed",
        "Reopen": "Reopened",
        "Inactivate": "Marked inactive",
        "Reactivate": "Reactivated",
        "Assignment": "Owner updated",
        "SponsorshipLink": "Sponsor linked",
        "SponsorshipUnlink": "Sponsor removed",
    }.get(action, action or "Newcomer update")


def _interaction_detail(entry: NewcomerInteraction) -> str | None:
    note = (entry.note or "").strip()
    if not note:
        return None
    return note if len(note) <= 96 else f"{note[:93].rstrip()}..."


def _newcomer_activity(
    audits: Iterable[NewcomerStatusAudit],
    interactions: Iterable[NewcomerInteraction],
) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in audits:
        actor = _actor_name(entry.actor)
        target = _newcomer_name(entry.newcomer)
        detail = None
        if entry.from_status or entry.to_status:
            detail = f"{_normalize_newcomer_status(entry.from_status)} → {_normalize_newcomer_status(entry.to_status)}"
        elif entry.reason:
            detail = entry.reason
        items.append(
            ReportActivityItem(
                id=f"newcomer-audit:{entry.id}",
                category="newcomer",
                action=_status_audit_action_label(entry),
                actor=actor,
                target=target,
                detail=detail or entry.reason,
                occurred_at=_normalize_timestamp(entry.changed_at),
                entity_type="newcomer",
                entity_id=entry.newcomer_id,
            )
        )

    for entry in interactions:
        target = _newcomer_name(entry.newcomer)
        interaction_type = entry.interaction_type.value if hasattr(entry.interaction_type, "value") else str(entry.interaction_type)
        items.append(
            ReportActivityItem(
                id=f"newcomer-interaction:{entry.id}",
                category="newcomer",
                action=f"{interaction_type or 'Interaction'} logged",
                actor=_actor_name(entry.author),
                target=target,
                detail=_interaction_detail(entry),
                occurred_at=_normalize_timestamp(entry.occurred_at),
                entity_type="newcomer",
                entity_id=entry.newcomer_id,
            )
        )

    return items


def _user_activity(entries: Iterable[UserAuditLog]) -> List[ReportActivityItem]:
    items: List[ReportActivityItem] = []
    for entry in entries:
        actor = _actor_name(entry.actor)
        target = _actor_name(entry.target_user)
        items.append(
            ReportActivityItem(
                id=f"user:{entry.id}",
                category="user",
                action=entry.action.value if hasattr(entry.action, "value") else str(entry.action),
                actor=actor,
                target=target,
                detail=None,
                occurred_at=_normalize_timestamp(entry.created_at),
                entity_type="user",
                entity_id=entry.target_user_id,
            )
        )
    return items


def _apply_newcomer_report_range(query, *, start_dt: datetime | None, end_dt: datetime | None):
    if start_dt:
        query = query.filter(Newcomer.created_at >= start_dt)
    if end_dt:
        query = query.filter(Newcomer.created_at <= end_dt)
    return query


def _format_breakdown(
    values: Iterable[tuple[str, int]],
    *,
    total: int,
    limit: int | None = None,
) -> list[ReportBreakdownItem]:
    items = [(label.strip(), int(value)) for label, value in values if label and str(label).strip() and int(value) > 0]
    items.sort(key=lambda item: (-item[1], item[0].lower()))
    if limit is not None:
        items = items[:limit]
    return [
        ReportBreakdownItem(
            label=label,
            value=value,
            share_percent=round((value / total) * 100, 1) if total else None,
        )
        for label, value in items
    ]


def _count_grouped(query, field, *, limit: int | None = None) -> list[tuple[str, int]]:
    grouped = query.with_entities(field, func.count(Newcomer.id)).group_by(field).all()
    rows = [((_literal_value(label) or "").strip(), int(value)) for label, value in grouped if (_literal_value(label) or "").strip()]
    rows.sort(key=lambda item: (-item[1], item[0].lower()))
    if limit is not None:
        rows = rows[:limit]
    return rows


def _is_open_newcomer(record: Newcomer, normalized_status: str) -> bool:
    return not record.is_inactive and normalized_status != "Closed"


def _is_stale_case(
    *,
    created_at: datetime,
    last_interaction_at: datetime | None,
    now: datetime,
) -> bool:
    anchor = last_interaction_at or created_at
    return anchor <= now - timedelta(days=NEWCOMER_STALE_DAYS)


def _case_attention_reasons(
    *,
    record: Newcomer,
    normalized_status: str,
    last_interaction_at: datetime | None,
    today: date,
    now: datetime,
) -> list[str]:
    reasons: list[str] = []
    if not _is_open_newcomer(record, normalized_status):
        return reasons

    if record.followup_due_date and record.followup_due_date < today:
        overdue_days = (today - record.followup_due_date).days
        reasons.append(f"Follow-up overdue by {overdue_days} day{'s' if overdue_days != 1 else ''}")
    if record.assigned_owner_id is None:
        reasons.append("No owner assigned")
    if _is_stale_case(created_at=record.created_at, last_interaction_at=last_interaction_at, now=now):
        reasons.append(f"No interaction in {NEWCOMER_STALE_DAYS}+ days")
    if record.interpreter_required and not record.sponsored_by_member_id:
        reasons.append("Interpreter support still needs coordination")
    return reasons


def _attention_sort_key(item: NewcomerReportCaseItem) -> tuple[int, date, datetime]:
    reason = item.attention_reason or ""
    if reason.startswith("Follow-up overdue"):
        rank = 0
    elif "No owner assigned" in reason:
        rank = 1
    elif "No interaction" in reason:
        rank = 2
    else:
        rank = 3
    return (
        rank,
        item.followup_due_date or date.max,
        item.created_at,
    )


def _owner_name(record: Newcomer) -> str | None:
    if not record.assigned_owner:
        return None
    return record.assigned_owner.full_name or record.assigned_owner.username or record.assigned_owner.email


def _sponsor_name(record: Newcomer) -> str | None:
    if not record.sponsored_by_member:
        return None
    parts = [record.sponsored_by_member.first_name, record.sponsored_by_member.last_name]
    return " ".join(part.strip() for part in parts if part and part.strip()) or None


def _to_newcomer_report_case_item(
    *,
    record: Newcomer,
    normalized_status: str,
    last_interaction_at: datetime | None,
    attention_reason: str | None = None,
) -> NewcomerReportCaseItem:
    return NewcomerReportCaseItem(
        id=record.id,
        newcomer_code=record.newcomer_code,
        full_name=record.full_name,
        status=normalized_status,
        arrival_date=record.arrival_date,
        created_at=record.created_at,
        followup_due_date=record.followup_due_date,
        assigned_owner_name=_owner_name(record),
        sponsored_by_member_name=_sponsor_name(record),
        last_interaction_at=last_interaction_at,
        county=record.county,
        preferred_language=record.preferred_language,
        interpreter_required=bool(record.interpreter_required),
        household_type=_literal_value(record.household_type) or "Individual",
        family_size=record.family_size,
        service_type=record.service_type,
        attention_reason=attention_reason,
    )


def get_newcomer_report(
    db: Session,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
) -> NewcomerReportResponse:
    start_dt, end_dt = _range_bounds(start_date, end_date)
    now = datetime.utcnow()
    today = now.date()
    recent_cutoff = now - timedelta(days=NEWCOMER_RECENT_DAYS)
    upcoming_cutoff = today + timedelta(days=FOLLOWUP_WINDOW_DAYS)

    base_query = _apply_newcomer_report_range(db.query(Newcomer), start_dt=start_dt, end_dt=end_dt)
    cohort_subq = _apply_newcomer_report_range(
        db.query(Newcomer.id),
        start_dt=start_dt,
        end_dt=end_dt,
    ).subquery()
    latest_interaction_subq = (
        db.query(
            NewcomerInteraction.newcomer_id.label("newcomer_id"),
            func.max(NewcomerInteraction.occurred_at).label("last_interaction_at"),
        )
        .join(cohort_subq, cohort_subq.c.id == NewcomerInteraction.newcomer_id)
        .group_by(NewcomerInteraction.newcomer_id)
        .subquery()
    )

    newcomer_rows = (
        _apply_newcomer_report_range(
            db.query(Newcomer, latest_interaction_subq.c.last_interaction_at)
            .outerjoin(latest_interaction_subq, Newcomer.id == latest_interaction_subq.c.newcomer_id)
            .options(
                selectinload(Newcomer.assigned_owner),
                selectinload(Newcomer.sponsored_by_member),
            ),
            start_dt=start_dt,
            end_dt=end_dt,
        )
        .order_by(Newcomer.created_at.desc(), Newcomer.id.desc())
        .all()
    )

    status_counts = {status: 0 for status in NEWCOMER_STATUS_FLOW}
    summary_counts = {
        "open_cases": 0,
        "inactive_cases": 0,
        "settled_cases": 0,
        "closed_cases": 0,
        "unassigned_cases": 0,
        "sponsored_cases": 0,
        "interpreter_required_cases": 0,
        "family_households": 0,
        "recent_intakes_30_days": 0,
        "followups_overdue": 0,
        "followups_due_next_7_days": 0,
        "stale_cases": 0,
    }
    owner_rollup: dict[tuple[int | None, str], dict[str, int]] = defaultdict(lambda: {"total": 0, "overdue": 0, "stale": 0})
    recent_cases: list[NewcomerReportCaseItem] = []
    attention_cases: list[NewcomerReportCaseItem] = []

    for record, last_interaction_at in newcomer_rows:
        normalized_status = _normalize_newcomer_status(record.status)
        status_counts[normalized_status] = status_counts.get(normalized_status, 0) + 1

        if record.is_inactive:
            summary_counts["inactive_cases"] += 1
        if normalized_status == "Settled":
            summary_counts["settled_cases"] += 1
        if normalized_status == "Closed":
            summary_counts["closed_cases"] += 1
        if record.sponsored_by_member_id is not None:
            summary_counts["sponsored_cases"] += 1
        if record.interpreter_required:
            summary_counts["interpreter_required_cases"] += 1
        if _literal_value(record.household_type) == "Family":
            summary_counts["family_households"] += 1
        if record.created_at >= recent_cutoff:
            summary_counts["recent_intakes_30_days"] += 1

        is_open = _is_open_newcomer(record, normalized_status)
        is_stale = _is_stale_case(created_at=record.created_at, last_interaction_at=last_interaction_at, now=now)
        if is_open:
            summary_counts["open_cases"] += 1
            if record.assigned_owner_id is None:
                summary_counts["unassigned_cases"] += 1
            if record.followup_due_date and record.followup_due_date < today:
                summary_counts["followups_overdue"] += 1
            elif record.followup_due_date and today <= record.followup_due_date <= upcoming_cutoff:
                summary_counts["followups_due_next_7_days"] += 1
            if is_stale:
                summary_counts["stale_cases"] += 1

            owner_key = (record.assigned_owner_id, _owner_name(record) or "Unassigned")
            owner_rollup[owner_key]["total"] += 1
            if record.followup_due_date and record.followup_due_date < today:
                owner_rollup[owner_key]["overdue"] += 1
            if is_stale:
                owner_rollup[owner_key]["stale"] += 1

        if len(recent_cases) < 6:
            recent_cases.append(
                _to_newcomer_report_case_item(
                    record=record,
                    normalized_status=normalized_status,
                    last_interaction_at=last_interaction_at,
                )
            )

        reasons = _case_attention_reasons(
            record=record,
            normalized_status=normalized_status,
            last_interaction_at=last_interaction_at,
            today=today,
            now=now,
        )
        if reasons:
            attention_cases.append(
                _to_newcomer_report_case_item(
                    record=record,
                    normalized_status=normalized_status,
                    last_interaction_at=last_interaction_at,
                    attention_reason=" · ".join(reasons),
                )
            )

    interactions_last_30_days = (
        db.query(func.count(NewcomerInteraction.id))
        .join(cohort_subq, cohort_subq.c.id == NewcomerInteraction.newcomer_id)
        .filter(NewcomerInteraction.occurred_at >= recent_cutoff)
        .scalar()
        or 0
    )
    interaction_rows = (
        db.query(NewcomerInteraction.interaction_type, func.count(NewcomerInteraction.id))
        .join(cohort_subq, cohort_subq.c.id == NewcomerInteraction.newcomer_id)
        .filter(NewcomerInteraction.occurred_at >= recent_cutoff)
        .group_by(NewcomerInteraction.interaction_type)
        .all()
    )
    interaction_breakdown = _format_breakdown(
        [
            (
                interaction_type.value if hasattr(interaction_type, "value") else str(interaction_type),
                int(count),
            )
            for interaction_type, count in interaction_rows
        ],
        total=int(interactions_last_30_days),
    )

    sponsorship_rows = (
        db.query(Sponsorship.status, func.count(Sponsorship.id))
        .join(cohort_subq, cohort_subq.c.id == Sponsorship.newcomer_id)
        .group_by(Sponsorship.status)
        .all()
    )
    sponsorship_counts = {
        (status.value if hasattr(status, "value") else str(status)): int(count)
        for status, count in sponsorship_rows
    }
    sponsorship_total = sum(sponsorship_counts.values())
    sponsorship_breakdown = [
        ReportBreakdownItem(
            label=status,
            value=sponsorship_counts[status],
            share_percent=round(
                (sponsorship_counts[status] / sponsorship_total) * 100,
                1,
            )
            if sponsorship_total
            else None,
        )
        for status in SPONSORSHIP_STATUS_ORDER
        if sponsorship_counts.get(status, 0) > 0
    ]

    owner_breakdown = [
        NewcomerOwnerBreakdownItem(
            owner_id=owner_id,
            owner_name=owner_name,
            total_cases=values["total"],
            overdue_followups=values["overdue"],
            stale_cases=values["stale"],
        )
        for (owner_id, owner_name), values in sorted(
            owner_rollup.items(),
            key=lambda item: (-item[1]["total"], item[0][1].lower()),
        )[:6]
    ]

    followup_total = summary_counts["open_cases"]
    on_track_cases = max(
        followup_total
        - summary_counts["followups_overdue"]
        - summary_counts["followups_due_next_7_days"]
        - sum(
            1
            for record, _ in newcomer_rows
            if _is_open_newcomer(record, _normalize_newcomer_status(record.status)) and record.followup_due_date is None
        ),
        0,
    )
    no_due_date_cases = sum(
        1
        for record, _ in newcomer_rows
        if _is_open_newcomer(record, _normalize_newcomer_status(record.status)) and record.followup_due_date is None
    )
    followup_breakdown = [
        ReportBreakdownItem(
            label=label,
            value=value,
            share_percent=round((value / followup_total) * 100, 1) if followup_total else None,
        )
        for label, value in (
            ("Overdue", summary_counts["followups_overdue"]),
            ("Due in 7 days", summary_counts["followups_due_next_7_days"]),
            ("On track", on_track_cases),
            ("No due date", no_due_date_cases),
        )
        if value > 0 or followup_total == 0
    ]

    total_cases = len(newcomer_rows)
    summary = NewcomerReportSummary(
        total_cases=total_cases,
        open_cases=summary_counts["open_cases"],
        inactive_cases=summary_counts["inactive_cases"],
        settled_cases=summary_counts["settled_cases"],
        closed_cases=summary_counts["closed_cases"],
        unassigned_cases=summary_counts["unassigned_cases"],
        sponsored_cases=summary_counts["sponsored_cases"],
        interpreter_required_cases=summary_counts["interpreter_required_cases"],
        family_households=summary_counts["family_households"],
        recent_intakes_30_days=summary_counts["recent_intakes_30_days"],
        followups_overdue=summary_counts["followups_overdue"],
        followups_due_next_7_days=summary_counts["followups_due_next_7_days"],
        stale_cases=summary_counts["stale_cases"],
        interactions_last_30_days=int(interactions_last_30_days),
        submitted_support_cases=sponsorship_counts.get("Submitted", 0),
        active_support_cases=sponsorship_counts.get("Active", 0),
        suspended_support_cases=sponsorship_counts.get("Suspended", 0),
    )

    county_breakdown = _format_breakdown(
        _count_grouped(base_query, Newcomer.county, limit=5),
        total=total_cases,
        limit=5,
    )
    language_breakdown = _format_breakdown(
        _count_grouped(base_query, Newcomer.preferred_language, limit=5),
        total=total_cases,
        limit=5,
    )
    referral_breakdown = _format_breakdown(
        _count_grouped(base_query, Newcomer.referred_by, limit=5),
        total=total_cases,
        limit=5,
    )
    status_breakdown = [
        ReportBreakdownItem(
            label="In progress" if status == "InProgress" else status,
            value=status_counts.get(status, 0),
            share_percent=round((status_counts.get(status, 0) / total_cases) * 100, 1) if total_cases else None,
        )
        for status in NEWCOMER_STATUS_FLOW
    ]

    attention_cases.sort(key=_attention_sort_key)

    return NewcomerReportResponse(
        summary=summary,
        status_breakdown=status_breakdown,
        followup_breakdown=followup_breakdown,
        county_breakdown=county_breakdown,
        language_breakdown=language_breakdown,
        referral_breakdown=referral_breakdown,
        interaction_breakdown=interaction_breakdown,
        sponsorship_breakdown=sponsorship_breakdown,
        owner_breakdown=owner_breakdown,
        recent_cases=recent_cases,
        attention_cases=attention_cases[:6],
    )


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

    newcomer_audit_query = (
        db.query(NewcomerStatusAudit)
        .options(selectinload(NewcomerStatusAudit.actor), selectinload(NewcomerStatusAudit.newcomer))
        .order_by(NewcomerStatusAudit.changed_at.desc())
    )
    if start_dt:
        newcomer_audit_query = newcomer_audit_query.filter(NewcomerStatusAudit.changed_at >= start_dt)
    if end_dt:
        newcomer_audit_query = newcomer_audit_query.filter(NewcomerStatusAudit.changed_at <= end_dt)
    newcomer_audit_entries = newcomer_audit_query.limit(limit).all()

    newcomer_interaction_query = (
        db.query(NewcomerInteraction)
        .options(selectinload(NewcomerInteraction.author), selectinload(NewcomerInteraction.newcomer))
        .order_by(NewcomerInteraction.occurred_at.desc())
    )
    if start_dt:
        newcomer_interaction_query = newcomer_interaction_query.filter(NewcomerInteraction.occurred_at >= start_dt)
    if end_dt:
        newcomer_interaction_query = newcomer_interaction_query.filter(NewcomerInteraction.occurred_at <= end_dt)
    newcomer_interaction_entries = newcomer_interaction_query.limit(limit).all()

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

    items = (
        _member_activity(member_entries)
        + _sponsorship_activity(sponsorship_entries)
        + _newcomer_activity(newcomer_audit_entries, newcomer_interaction_entries)
        + _user_activity(user_entries)
    )
    items.sort(key=lambda item: item.occurred_at, reverse=True)
    return items[:limit]
