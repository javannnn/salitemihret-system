"""Add full_name to user invitations.

Revision ID: 2b6d4a7f9c31
Revises: 1f4e9c7a2b1d
Create Date: 2026-03-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "2b6d4a7f9c31"
down_revision = "1f4e9c7a2b1d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_invitations", sa.Column("full_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("user_invitations", "full_name")
