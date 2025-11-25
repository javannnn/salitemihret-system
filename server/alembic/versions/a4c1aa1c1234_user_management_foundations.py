"""user management foundations

Revision ID: a4c1aa1c1234
Revises: d982f95d92b3
Create Date: 2025-11-20 00:00:00.000000
"""

from __future__ import annotations

import re
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "a4c1aa1c1234"
down_revision = "c0c2e8ddf7d2"
branch_labels = None
depends_on = None


user_member_link_status = postgresql.ENUM("linked", "pending_review", "rejected", name="user_member_link_status", create_type=False)
user_audit_action = postgresql.ENUM(
    "INVITE_SENT",
    "USER_CREATED",
    "ROLE_UPDATED",
    "USERNAME_CHANGED",
    "MEMBER_LINKED",
    "MEMBER_UNLINKED",
    "PASSWORD_RESET_SENT",
    "USER_STATUS_CHANGED",
    "LINK_REQUESTED",
    name="user_audit_action",
    create_type=False,
)


def sanitize_username(value: str) -> str:
    base = value.split("@")[0].lower()
    base = re.sub(r"[^a-z0-9._]", "", base)
    base = base.strip("._")
    if len(base) < 4:
        base = f"user{datetime.utcnow().strftime('%f')}"
    return base[:32]


def upgrade() -> None:
    op.add_column("users", sa.Column("username", sa.String(length=150), nullable=True))
    op.add_column(
        "users",
        sa.Column("is_super_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.add_column(
        "users",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.add_column("users", sa.Column("username_changed_at", sa.DateTime(timezone=True), nullable=True))

    connection = op.get_bind()
    users_table = sa.table(
        "users",
        sa.Column("id", sa.Integer()),
        sa.Column("email", sa.String()),
        sa.Column("username", sa.String()),
    )
    existing_usernames = set()
    result = connection.execute(sa.select(users_table.c.id, users_table.c.email))
    rows = result.fetchall()
    for row in rows:
        base = sanitize_username(row.email or f"user{row.id}")
        candidate = base
        suffix = 1
        while candidate in existing_usernames:
            candidate = f"{base}{suffix}"
            suffix += 1
        existing_usernames.add(candidate)
        connection.execute(
            sa.update(users_table).where(users_table.c.id == row.id).values(username=candidate),
        )

    op.alter_column("users", "username", existing_type=sa.String(length=150), nullable=False)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    if connection.dialect.name == "postgresql":
        connection.execute(sa.text("DROP TYPE IF EXISTS user_member_link_status CASCADE"))
        connection.execute(sa.text("DROP TYPE IF EXISTS user_audit_action CASCADE"))
        connection.execute(sa.text("CREATE TYPE user_member_link_status AS ENUM ('linked', 'pending_review', 'rejected')"))
        connection.execute(sa.text("CREATE TYPE user_audit_action AS ENUM ('INVITE_SENT','USER_CREATED','ROLE_UPDATED','USERNAME_CHANGED','MEMBER_LINKED','MEMBER_UNLINKED','PASSWORD_RESET_SENT','USER_STATUS_CHANGED','LINK_REQUESTED')"))

    op.create_table(
        "user_invitations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("roles_snapshot", sa.JSON(), nullable=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invited_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("message", sa.String(length=500), nullable=True),
    )
    op.create_index("ix_user_invitations_email", "user_invitations", ["email"], unique=False)

    op.create_table(
        "user_member_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True, unique=True),
        sa.Column("status", user_member_link_status, nullable=False, server_default="linked"),
        sa.Column("notes", sa.String(length=255), nullable=True),
        sa.Column("linked_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )

    op.create_table(
        "user_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", user_audit_action, nullable=False),
        sa.Column("target_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("timezone('utc', now())")),
    )
    op.create_index("ix_user_audit_logs_target", "user_audit_logs", ["target_user_id"])
    op.create_index("ix_user_audit_logs_created_at", "user_audit_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_user_audit_logs_created_at", table_name="user_audit_logs")
    op.drop_index("ix_user_audit_logs_target", table_name="user_audit_logs")
    op.drop_table("user_audit_logs")
    op.drop_table("user_member_links")
    op.drop_index("ix_user_invitations_email", table_name="user_invitations")
    op.drop_table("user_invitations")

    connection = op.get_bind()
    user_audit_action.drop(connection, checkfirst=True)
    user_member_link_status.drop(connection, checkfirst=True)

    op.drop_index("ix_users_username", table_name="users")
    op.drop_column("users", "username_changed_at")
    op.drop_column("users", "updated_at")
    op.drop_column("users", "created_at")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "is_super_admin")
    op.drop_column("users", "username")
