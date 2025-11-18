"""Overhaul Sunday School module for participants and content.

Revision ID: 5f0b1a3c1c1d
Revises: 9c2a1a0f7abc
Create Date: 2025-02-28 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "5f0b1a3c1c1d"
down_revision = "9c2a1a0f7abc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sunday_school_enrollments", sa.Column("member_username", sa.String(length=150), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column(
        "sunday_school_enrollments",
        sa.Column("gender", postgresql.ENUM(name="member_gender", create_type=False), nullable=True),
    )
    op.add_column("sunday_school_enrollments", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("created_by_id", sa.Integer(), nullable=True))
    op.add_column("sunday_school_enrollments", sa.Column("updated_by_id", sa.Integer(), nullable=True))
    op.add_column(
        "sunday_school_enrollments",
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
    )
    op.create_foreign_key(
        None,
        "sunday_school_enrollments",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        None,
        "sunday_school_enrollments",
        "users",
        ["updated_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        UPDATE sunday_school_enrollments
        SET membership_date = COALESCE(membership_date, enrollment_date)
        """
    )
    op.execute(
        """
        UPDATE sunday_school_enrollments AS s
        SET member_username = m.username,
            first_name = m.first_name,
            last_name = m.last_name,
            gender = COALESCE(s.gender, m.gender),
            date_of_birth = m.birth_date
        FROM members AS m
        WHERE s.member_id = m.id
        """
    )

    op.alter_column("sunday_school_enrollments", "member_username", nullable=False)
    op.alter_column("sunday_school_enrollments", "first_name", nullable=False)
    op.alter_column("sunday_school_enrollments", "last_name", nullable=False)
    op.alter_column("sunday_school_enrollments", "is_active", server_default=None)
    op.create_index(
        "ix_sunday_school_member_username",
        "sunday_school_enrollments",
        ["member_username"],
        unique=False,
    )

    op.drop_constraint("sunday_school_enrollments_guardian_member_id_fkey", "sunday_school_enrollments", type_="foreignkey")
    op.drop_constraint("sunday_school_enrollments_mezmur_id_fkey", "sunday_school_enrollments", type_="foreignkey")
    op.drop_column("sunday_school_enrollments", "guardian_member_id")
    op.drop_column("sunday_school_enrollments", "class_level")
    op.drop_column("sunday_school_enrollments", "status")
    op.drop_column("sunday_school_enrollments", "mezmur_id")
    op.drop_column("sunday_school_enrollments", "enrollment_date")
    op.drop_column("sunday_school_enrollments", "expected_graduation")
    op.drop_column("sunday_school_enrollments", "notes")
    op.drop_column("sunday_school_enrollments", "last_attended_on")

    op.drop_constraint("sunday_school_contents_enrollment_id_fkey", "sunday_school_contents", type_="foreignkey")
    op.alter_column("sunday_school_contents", "enrollment_id", new_column_name="participant_id")
    op.alter_column("sunday_school_contents", "attachment_url", new_column_name="file_path")
    op.add_column("sunday_school_contents", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        None,
        "sunday_school_contents",
        "sunday_school_enrollments",
        ["participant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("sunday_school_contents", "student_first_name")
    op.drop_column("sunday_school_contents", "student_last_name")
    op.drop_column("sunday_school_contents", "student_gender")
    op.drop_column("sunday_school_contents", "student_birth_date")

    op.drop_table("sunday_school_attendance")


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for this migration.")
