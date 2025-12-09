"""add deleted flags to chat messages

Revision ID: e1a5c2e7c4a4
Revises: c7c6b5a41a88
Create Date: 2025-11-28 14:25:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1a5c2e7c4a4"
down_revision = "c7c6b5a41a88"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("messages", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.alter_column("messages", "is_deleted", server_default=None)


def downgrade() -> None:
    op.drop_column("messages", "deleted_at")
    op.drop_column("messages", "is_deleted")
