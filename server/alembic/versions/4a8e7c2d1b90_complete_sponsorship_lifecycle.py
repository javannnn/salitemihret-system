"""Complete sponsorship lifecycle dates and reversal auditing.

Revision ID: 4a8e7c2d1b90
Revises: 2d9f6b3a8c12
Create Date: 2026-08-12 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "4a8e7c2d1b90"
down_revision = "2d9f6b3a8c12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.execute(sa.text("ALTER TYPE sponsorship_audit_action ADD VALUE IF NOT EXISTS 'Reversal'"))

    op.add_column("sponsorships", sa.Column("completed_at", sa.DateTime(), nullable=True))
    if bind.dialect.name != "sqlite":
        op.alter_column("sponsorships", "monthly_amount", server_default=sa.text("0"))
    op.execute(
        """
        UPDATE sponsorships
        SET last_sponsored_date = start_date
        WHERE start_date IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE sponsorships
        SET completed_at = COALESCE(updated_at, created_at)
        WHERE CAST(status AS VARCHAR) IN ('Completed', 'Closed')
          AND completed_at IS NULL
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "sqlite":
        op.alter_column("sponsorships", "monthly_amount", server_default=None)
    op.drop_column("sponsorships", "completed_at")
    # PostgreSQL enum values are intentionally retained because removing one
    # requires rebuilding the type and can invalidate existing audit history.
