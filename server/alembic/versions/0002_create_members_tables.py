"""create members tables

Revision ID: 0002_create_members_tables
Revises: 0001_create_users_and_roles
Create Date: 2025-10-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "0002_create_members_tables"
down_revision = "0001_create_users_and_roles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
        CREATE TYPE member_status AS ENUM ('Active','Inactive','Archived');
    END IF;
END$$;
"""
    )
    member_status_enum = postgresql.ENUM(name="member_status", create_type=False)

    op.create_table(
        "members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("username", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=25), nullable=True),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("status", member_status_enum, nullable=False, server_default="Active"),
        sa.Column("is_tither", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("contribution_method", sa.String(length=100), nullable=True),
        sa.Column("contribution_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_members_username", "members", ["username"], unique=True)

    op.create_table(
        "spouses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=25), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
    )

    op.create_table(
        "children",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("children")
    op.drop_table("spouses")
    op.drop_index("ix_members_username", table_name="members")
    op.drop_table("members")
    op.execute("DROP TYPE IF EXISTS member_status;")
