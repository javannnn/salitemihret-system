"""add sunday school audit logs table

Revision ID: 6a8c3d7f4f5d
Revises: bbc8a3d5d8fa
Create Date: 2025-11-23 00:45:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "6a8c3d7f4f5d"
down_revision = "bbc8a3d5d8fa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sunday_school_audit_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("detail", sa.Text, nullable=True),
        sa.Column("changes", sa.JSON, nullable=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("sunday_school_audit_logs")
