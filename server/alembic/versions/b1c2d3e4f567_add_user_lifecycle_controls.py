"""add user lifecycle controls

Revision ID: b1c2d3e4f567
Revises: 3b6a4d91e2f7
Create Date: 2026-04-15 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "b1c2d3e4f567"
down_revision = "3b6a4d91e2f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for value in ("USER_SUSPENDED", "USER_UNSUSPENDED", "USER_DELETED", "USER_RESTORED"):
            bind.execute(sa.text(f"ALTER TYPE user_audit_action ADD VALUE IF NOT EXISTS '{value}'"))

    op.add_column("users", sa.Column("suspended_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("suspension_reason", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("suspended_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("deletion_reason", sa.String(length=500), nullable=True))
    op.add_column("users", sa.Column("deleted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_users_suspended_until", "users", ["suspended_until"], unique=False)
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_index("ix_users_suspended_until", table_name="users")
    op.drop_column("users", "deleted_by_user_id")
    op.drop_column("users", "deletion_reason")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "suspended_by_user_id")
    op.drop_column("users", "suspension_reason")
    op.drop_column("users", "suspended_until")
