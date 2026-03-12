"""Backfill sponsorship last sponsored dates from start dates.

Revision ID: 8c3b4d5e6f71
Revises: 7a1d9e3c4b55
Create Date: 2026-03-12 00:00:00.000000
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "8c3b4d5e6f71"
down_revision = "7a1d9e3c4b55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE sponsorships
        SET last_sponsored_date = start_date
        WHERE last_sponsored_date IS NULL
          AND start_date IS NOT NULL
        """
    )


def downgrade() -> None:
    # Irreversible data backfill: preserve populated dates on downgrade.
    pass
