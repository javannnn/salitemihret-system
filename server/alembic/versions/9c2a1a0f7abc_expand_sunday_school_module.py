"""Expand Sunday School module with contribution + content tables

Revision ID: 9c2a1a0f7abc
Revises: 8d3a9f4e7b2a
Create Date: 2025-02-15 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "9c2a1a0f7abc"
down_revision: Union[str, None] = "8d3a9f4e7b2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_enum_if_not_exists(name: str, values: list[str]) -> None:
    quoted_values = ", ".join(f"'{value}'" for value in values)
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN
                CREATE TYPE {name} AS ENUM ({quoted_values});
            END IF;
        END
        $$;
        """
    )


def upgrade() -> None:
    _create_enum_if_not_exists("sunday_category", ["Child", "Youth", "Adult"])
    _create_enum_if_not_exists("sunday_content_type", ["Mezmur", "Lesson", "Art"])
    _create_enum_if_not_exists("sunday_content_status", ["Draft", "Pending", "Approved", "Rejected"])

    op.add_column(
        "sunday_school_enrollments",
        sa.Column(
            "category",
            postgresql.ENUM("Child", "Youth", "Adult", name="sunday_category", create_type=False),
            nullable=False,
            server_default="Child",
        ),
    )
    op.add_column("sunday_school_enrollments", sa.Column("membership_date", sa.Date(), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("phone", sa.String(length=40), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("pays_contribution", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("sunday_school_enrollments", sa.Column("monthly_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("payment_method", sa.String(length=50), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("last_payment_at", sa.DateTime(), nullable=True))
    op.alter_column("sunday_school_enrollments", "category", server_default=None)
    op.alter_column("sunday_school_enrollments", "pays_contribution", server_default=None)

    op.create_table(
        "sunday_school_contents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "type",
            postgresql.ENUM("Mezmur", "Lesson", "Art", name="sunday_content_type", create_type=False),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("attachment_url", sa.String(length=500), nullable=True),
        sa.Column("student_first_name", sa.String(length=120), nullable=True),
        sa.Column("student_last_name", sa.String(length=120), nullable=True),
        sa.Column(
            "student_gender",
            postgresql.ENUM("Male", "Female", "Other", name="member_gender", create_type=False),
            nullable=True,
        ),
        sa.Column("student_birth_date", sa.Date(), nullable=True),
        sa.Column("enrollment_id", sa.Integer(), sa.ForeignKey("sunday_school_enrollments.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM("Draft", "Pending", "Approved", "Rejected", name="sunday_content_status", create_type=False),
            nullable=False,
            server_default="Draft",
        ),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("approved_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "sunday_school_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )


def downgrade() -> None:
    op.drop_table("sunday_school_audit_logs")
    op.drop_table("sunday_school_contents")

    op.drop_column("sunday_school_enrollments", "last_payment_at")
    op.drop_column("sunday_school_enrollments", "payment_method")
    op.drop_column("sunday_school_enrollments", "monthly_amount")
    op.drop_column("sunday_school_enrollments", "pays_contribution")
    op.drop_column("sunday_school_enrollments", "email")
    op.drop_column("sunday_school_enrollments", "phone")
    op.drop_column("sunday_school_enrollments", "membership_date")
    op.drop_column("sunday_school_enrollments", "category")

    for enum_name in ("sunday_content_status", "sunday_content_type", "sunday_category"):
        enum_type = postgresql.ENUM(name=enum_name)
        enum_type.drop(op.get_bind(), checkfirst=True)
