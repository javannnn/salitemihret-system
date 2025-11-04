"""members expansion

Revision ID: 0003_members_expansion
Revises: 0002_create_members_tables
Create Date: 2025-10-30
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_members_expansion"
down_revision = "0002_create_members_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_gender') THEN
        CREATE TYPE member_gender AS ENUM ('Male','Female','Other');
    END IF;
END$$;
"""
    )
    gender_enum = sa.Enum(name="member_gender", create_type=False)

    op.create_table(
        "households",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False, unique=True),
        sa.Column("head_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.add_column("members", sa.Column("middle_name", sa.String(length=100), nullable=True))
    op.add_column("members", sa.Column("gender", gender_enum, nullable=True))
    op.add_column("members", sa.Column("join_date", sa.Date(), nullable=True))
    op.add_column("members", sa.Column("address", sa.String(length=255), nullable=True))
    op.add_column("members", sa.Column("district", sa.String(length=100), nullable=True))
    op.add_column("members", sa.Column("avatar_path", sa.String(length=255), nullable=True))
    op.add_column(
        "members",
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_members_status", "members", ["status"])
    op.execute("CREATE INDEX IF NOT EXISTS ix_members_deleted_at ON members (deleted_at)")
    op.create_index("ix_members_created_at", "members", ["created_at"])

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=120), nullable=False, unique=True),
    )

    op.create_table(
        "member_tags",
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
        sa.UniqueConstraint("member_id", "tag_id", name="uq_member_tag"),
    )

    op.create_table(
        "ministries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=140), nullable=False, unique=True),
    )

    op.create_table(
        "member_ministries",
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("ministry_id", sa.Integer(), sa.ForeignKey("ministries.id", ondelete="CASCADE"), primary_key=True),
        sa.UniqueConstraint("member_id", "ministry_id", name="uq_member_ministry"),
    )

    op.create_table(
        "member_audit",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("field", sa.String(length=100), nullable=False),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.func.now(), index=True),
    )

    op.execute("CREATE INDEX IF NOT EXISTS ix_member_audit_member_id ON member_audit (member_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_member_audit_changed_at ON member_audit (changed_at)")


def downgrade() -> None:
    op.drop_index("ix_member_audit_changed_at", table_name="member_audit")
    op.drop_index("ix_member_audit_member_id", table_name="member_audit")
    op.drop_table("member_audit")
    op.drop_table("member_ministries")
    op.drop_table("ministries")
    op.drop_table("member_tags")
    op.drop_table("tags")
    op.drop_index("ix_members_created_at", table_name="members")
    op.drop_index("ix_members_deleted_at", table_name="members")
    op.drop_index("ix_members_status", table_name="members")
    op.drop_column("members", "updated_by_id")
    op.drop_column("members", "created_by_id")
    op.drop_column("members", "household_id")
    op.drop_column("members", "avatar_path")
    op.drop_column("members", "district")
    op.drop_column("members", "address")
    op.drop_column("members", "join_date")
    op.drop_column("members", "gender")
    op.drop_column("members", "middle_name")
    op.drop_table("households")
    op.execute("DROP TYPE IF EXISTS member_gender;")
