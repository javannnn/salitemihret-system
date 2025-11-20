"""Track membership status from payments with override support.

Revision ID: c0c2e8ddf7d2
Revises: 5f0b1a3c1c1d
Create Date: 2025-03-01 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c0c2e8ddf7d2"
down_revision = "5f0b1a3c1c1d"
branch_labels = None
depends_on = None


member_status_enum = sa.Enum("Active", "Inactive", "Pending", "Archived", name="member_status", create_type=False)


def upgrade() -> None:
    op.add_column(
        "members",
        sa.Column("contribution_last_paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("contribution_next_due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("status_auto", member_status_enum, nullable=False, server_default="Pending"),
    )
    op.add_column(
        "members",
        sa.Column("status_override", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "members",
        sa.Column("status_override_value", member_status_enum, nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("status_override_reason", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_members_contribution_next_due_at",
        "members",
        ["contribution_next_due_at"],
    )

    op.execute("UPDATE members SET status_auto = status")

    op.execute(
        """
        UPDATE members AS m
        SET contribution_last_paid_at = latest.last_paid_at
        FROM (
            SELECT member_id, MAX(paid_at)::timestamp AT TIME ZONE 'UTC' AS last_paid_at
            FROM member_contribution_payments
            GROUP BY member_id
        ) AS latest
        WHERE latest.member_id = m.id
        """
    )

    op.execute(
        """
        UPDATE members
        SET contribution_next_due_at = COALESCE(
            contribution_last_paid_at,
            created_at
        ) + INTERVAL '30 days'
        """
    )

    op.alter_column("members", "status_auto", server_default=None, existing_type=member_status_enum)
    op.alter_column("members", "status_override", server_default=None, existing_type=sa.Boolean())


def downgrade() -> None:
    op.drop_index("ix_members_contribution_next_due_at", table_name="members")
    op.drop_column("members", "status_override_reason")
    op.drop_column("members", "status_override_value")
    op.drop_column("members", "status_override")
    op.drop_column("members", "status_auto")
    op.drop_column("members", "contribution_next_due_at")
    op.drop_column("members", "contribution_last_paid_at")
