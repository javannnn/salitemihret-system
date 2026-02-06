from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import List, Optional

from app.core.config import settings
from app.models.member import Member, MemberStatus

DEFAULT_CONTRIBUTION_AMOUNT = Decimal("75.00")
GRACE_PERIOD_DAYS = 5
MIN_MONTHS_COVERED = 1
EVENT_HISTORY_LIMIT = 25


@dataclass
class MembershipHealthData:
    effective_status: str
    auto_status: str
    override_active: bool
    override_reason: Optional[str]
    last_paid_at: Optional[datetime]
    next_due_at: Optional[datetime]
    days_until_due: Optional[int]
    overdue_days: Optional[int]
    consecutive_months: int
    required_consecutive_months: int


@dataclass
class MembershipEventData:
    timestamp: datetime
    type: str
    label: str
    description: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _add_months(start: datetime, months: int) -> datetime:
    month_index = start.month - 1 + months
    year = start.year + month_index // 12
    month = month_index % 12 + 1
    day = min(start.day, _days_in_month(year, month))
    return start.replace(year=year, month=month, day=day)


def _days_in_month(year: int, month: int) -> int:
    thirty_one = {1, 3, 5, 7, 8, 10, 12}
    if month in thirty_one:
        return 31
    if month == 2:
        if (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:
            return 29
        return 28
    return 30


def _monthly_amount(member: Member) -> Decimal:
    try:
        return Decimal(str(member.contribution_amount or DEFAULT_CONTRIBUTION_AMOUNT)).quantize(Decimal("0.01"))
    except (InvalidOperation, TypeError):
        return DEFAULT_CONTRIBUTION_AMOUNT


def months_covered(payment_amount: Decimal, member: Member) -> int:
    monthly = _monthly_amount(member)
    if monthly <= 0:
        monthly = DEFAULT_CONTRIBUTION_AMOUNT
    months = int(payment_amount // monthly)
    return max(months, MIN_MONTHS_COVERED)


def _required_consecutive_months() -> int:
    try:
        return max(1, int(settings.MEMBERSHIP_CONSECUTIVE_MONTHS_REQUIRED))
    except (TypeError, ValueError):
        return 1


def _calculate_consecutive_months(member: Member, now: datetime) -> int:
    payments = list(getattr(member, "contribution_payments", []) or [])
    if not payments:
        return 0
    payments.sort(key=lambda item: (item.paid_at, item.id))
    grace = timedelta(days=GRACE_PERIOD_DAYS)
    consecutive_months = 0
    coverage_end: datetime | None = None
    for payment in payments:
        paid_at = _combine_date(payment.paid_at)
        payment_amount = Decimal(str(payment.amount))
        covered_months = months_covered(payment_amount, member)
        if coverage_end is None:
            start = paid_at
            consecutive_months = covered_months
        else:
            if paid_at > coverage_end + grace:
                start = paid_at
                consecutive_months = covered_months
            else:
                start = paid_at if paid_at > coverage_end else coverage_end
                consecutive_months += covered_months
        coverage_end = _add_months(start, covered_months)
    if coverage_end and now <= coverage_end + grace:
        return consecutive_months
    return 0


def apply_contribution_payment(member: Member, *, amount: Decimal, posted_at: datetime) -> MembershipHealthData:
    posted = _ensure_datetime(posted_at) or _now()
    member.contribution_last_paid_at = posted
    current_due = _ensure_datetime(member.contribution_next_due_at)
    coverage_months = months_covered(amount, member)
    base = posted if current_due is None or posted > current_due else current_due
    member.contribution_next_due_at = _add_months(base, coverage_months)
    return refresh_membership_state(member, reference_time=posted)


def refresh_membership_state(
    member: Member,
    *,
    reference_time: datetime | None = None,
    persist: bool = True,
) -> MembershipHealthData:
    now = reference_time or _now()
    now = _ensure_datetime(now) or _now()
    last_paid = _ensure_datetime(member.contribution_last_paid_at)
    next_due = _ensure_datetime(member.contribution_next_due_at)
    required_consecutive = _required_consecutive_months()

    if next_due is None:
        anchor = last_paid or _derive_anchor(member, now)
        next_due = anchor + timedelta(days=30)
        if persist:
            member.contribution_next_due_at = next_due

    consecutive_months = _calculate_consecutive_months(member, now)

    if last_paid is None:
        auto_status = "Pending"
    else:
        delta_days = int((next_due - now).total_seconds() // 86400)
        overdue = delta_days < -GRACE_PERIOD_DAYS
        if overdue:
            auto_status = "Inactive"
        elif consecutive_months >= required_consecutive:
            auto_status = "Active"
        else:
            auto_status = "Pending"

    effective_status = auto_status
    override_reason = member.status_override_reason
    if member.status_override and member.status_override_value:
        effective_status = member.status_override_value

    if persist:
        member.status_auto = auto_status  # type: ignore[assignment]
        member.status = effective_status  # type: ignore[assignment]

    days_until_due = None
    overdue_days = None
    if next_due:
        delta = next_due - now
        days_until_due = int(delta.total_seconds() // 86400)
        if days_until_due < 0:
            overdue_days = abs(days_until_due)

    return MembershipHealthData(
        effective_status=effective_status,
        auto_status=auto_status,
        override_active=member.status_override,
        override_reason=override_reason,
        last_paid_at=last_paid,
        next_due_at=next_due,
        days_until_due=days_until_due,
        overdue_days=overdue_days,
        consecutive_months=consecutive_months,
        required_consecutive_months=required_consecutive,
    )


def set_status_override(member: Member, *, enabled: bool, value: Optional[str], reason: Optional[str]) -> None:
    member.status_override = enabled
    if not enabled:
        member.status_override_value = None
        member.status_override_reason = None
        return
    if value is None:
        raise ValueError("Override value is required when enabling status override")
    if value not in ("Active", "Inactive", "Pending", "Archived"):
        raise ValueError("Invalid override status value")
    member.status_override_value = value
    member.status_override_reason = reason


def build_membership_events(member: Member, health: MembershipHealthData, limit: int = EVENT_HISTORY_LIMIT) -> List[MembershipEventData]:
    events: List[MembershipEventData] = []
    if member.contribution_history:
        for payment in member.contribution_history[:limit]:
            stamp = _combine_date(payment.paid_at)
            events.append(
                MembershipEventData(
                    timestamp=stamp,
                    type="Renewal",
                    label=f"Contribution recorded ({payment.amount} {payment.currency})",
                    description=payment.method,
                )
            )
    if health.overdue_days and health.next_due_at:
        events.append(
            MembershipEventData(
                timestamp=health.next_due_at,
                type="Overdue",
                label=f"Overdue by {health.overdue_days} days",
                description="Membership inactive until payment posts",
            )
        )
    if member.status_override and member.status_override_value:
        events.append(
            MembershipEventData(
                timestamp=_ensure_datetime(member.updated_at) or _now(),
                type="Override",
                label=f"Override → {member.status_override_value}",
                description=member.status_override_reason,
            )
        )

    return sorted(events, key=lambda event: event.timestamp, reverse=True)


def _derive_anchor(member: Member, fallback: datetime) -> datetime:
    if member.join_date:
        return _combine_date(member.join_date)
    created = _ensure_datetime(member.created_at)
    if created:
        return created
    return fallback


def _combine_date(value: date | datetime) -> datetime:
    if isinstance(value, datetime):
        return _ensure_datetime(value) or _now()
    return datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)
