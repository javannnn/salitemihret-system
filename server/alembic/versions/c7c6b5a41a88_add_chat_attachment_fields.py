"""add chat attachment fields

Revision ID: c7c6b5a41a88
Revises: 972113364d77
Create Date: 2025-11-28 13:59:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c7c6b5a41a88"
down_revision = "972113364d77"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("type", sa.String(length=20), nullable=False, server_default="text"))
    op.add_column("messages", sa.Column("attachment_path", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("attachment_name", sa.String(length=255), nullable=True))
    op.add_column("messages", sa.Column("attachment_mime", sa.String(length=100), nullable=True))
    op.alter_column("messages", "type", server_default=None)


def downgrade() -> None:
    op.drop_column("messages", "attachment_mime")
    op.drop_column("messages", "attachment_name")
    op.drop_column("messages", "attachment_path")
    op.drop_column("messages", "type")
