"""Add must_change_password to users.

Revision ID: 6c14d8e5ab21
Revises: 2b6d4a7f9c31
Create Date: 2026-03-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6c14d8e5ab21"
down_revision = "2b6d4a7f9c31"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("users", "must_change_password", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
