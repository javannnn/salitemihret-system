"""Add promoted_at column to children for promotion tracking.

Revision ID: 0004_child_promoted_at
Revises: 0003_members_expansion
Create Date: 2025-11-03
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0004_child_promoted_at"
down_revision = "0003_members_expansion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "children",
        sa.Column("promoted_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("children", "promoted_at")

