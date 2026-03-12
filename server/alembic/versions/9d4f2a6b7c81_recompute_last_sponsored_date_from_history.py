"""Recompute sponsorship last sponsored dates from prior case history.

Revision ID: 9d4f2a6b7c81
Revises: 8c3b4d5e6f71
Create Date: 2026-03-12 00:00:01.000000
"""

from __future__ import annotations

from datetime import date, datetime

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "9d4f2a6b7c81"
down_revision = "8c3b4d5e6f71"
branch_labels = None
depends_on = None


def _history_key(row: sa.RowMapping) -> tuple[str, int | str] | None:
    if row["beneficiary_member_id"] is not None:
        return ("member", row["beneficiary_member_id"])
    if row["newcomer_id"] is not None:
        return ("newcomer", row["newcomer_id"])
    name = (row["beneficiary_name"] or "").strip().lower()
    if name:
        return ("name", name)
    return None


def _case_reference_date(row: sa.RowMapping) -> date | None:
    return row["end_date"] or row["start_date"] or _as_date(row["created_at"])


def _as_date(value: date | datetime | None) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    return value


def upgrade() -> None:
    bind = op.get_bind()
    sponsorships = sa.table(
        "sponsorships",
        sa.column("id", sa.Integer),
        sa.column("beneficiary_member_id", sa.Integer),
        sa.column("newcomer_id", sa.Integer),
        sa.column("beneficiary_name", sa.String),
        sa.column("start_date", sa.Date),
        sa.column("end_date", sa.Date),
        sa.column("last_sponsored_date", sa.Date),
        sa.column("last_status", sa.String),
        sa.column("last_status_reason", sa.String),
        sa.column("created_at", sa.DateTime),
    )

    rows = list(
        bind.execute(
            sa.select(
                sponsorships.c.id,
                sponsorships.c.beneficiary_member_id,
                sponsorships.c.newcomer_id,
                sponsorships.c.beneficiary_name,
                sponsorships.c.start_date,
                sponsorships.c.end_date,
                sponsorships.c.last_sponsored_date,
                sponsorships.c.last_status,
                sponsorships.c.last_status_reason,
                sponsorships.c.created_at,
            )
        ).mappings()
    )

    grouped_rows: dict[tuple[str, int | str], list[sa.RowMapping]] = {}
    for row in rows:
        key = _history_key(row)
        if key is not None:
            grouped_rows.setdefault(key, []).append(row)

    for history_rows in grouped_rows.values():
        sorted_rows = sorted(
            history_rows,
            key=lambda row: (
                _case_reference_date(row) or date.min,
                _as_date(row["created_at"]) or date.min,
                row["id"],
            ),
        )
        previous_case_date = None
        for row in sorted_rows:
            current_last_sponsored_date = row["last_sponsored_date"]
            auto_derived = current_last_sponsored_date is None or (
                current_last_sponsored_date == row["start_date"]
                and row["last_status"] is None
                and not row["last_status_reason"]
            )

            if auto_derived and current_last_sponsored_date != previous_case_date:
                bind.execute(
                    sa.update(sponsorships)
                    .where(sponsorships.c.id == row["id"])
                    .values(last_sponsored_date=previous_case_date)
                )

            case_date = _case_reference_date(row)
            if case_date is not None:
                previous_case_date = case_date


def downgrade() -> None:
    # Irreversible data correction: preserve recomputed historical dates on downgrade.
    pass
