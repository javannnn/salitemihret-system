"""Add lesson, mezmur, and enrollment tables for the schools module.

Revision ID: 9f33c5957c06
Revises: 4f01e89343bf
Create Date: 2025-02-14 12:20:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "9f33c5957c06"
down_revision = "4f01e89343bf"
branch_labels = None
depends_on = None


ENUM_DEFINITIONS = {
    "lesson_level": ("SundaySchool", "Abenet"),
    "sunday_class_level": ("Kindergarten", "Primary", "Intermediate", "Youth"),
    "school_enrollment_status": ("Enrolled", "OnHold", "Completed", "Withdrawn"),
    "mezmur_language": ("Geez", "Amharic", "English"),
    "mezmur_category": ("Liturgy", "Youth", "SpecialEvent"),
    "weekday_name": ("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"),
    "attendance_status": ("Present", "Absent", "Excused"),
    "abenet_service_stage": ("Alphabet", "Reading", "ForDeacons"),
    "abenet_enrollment_status": ("Active", "Paused", "Completed", "Cancelled"),
}


def upgrade() -> None:
    for enum_name, values in ENUM_DEFINITIONS.items():
        op.execute(
            sa.text(
                """
                DO $$
                BEGIN
                    CREATE TYPE {enum_name} AS ENUM ({values});
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END$$;
                """.format(
                    enum_name=enum_name,
                    values=",".join(f"'{value}'" for value in values),
                )
            )
        )

    op.create_table(
        "lessons",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("lesson_code", sa.String(length=50), nullable=False, unique=True),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "level",
            postgresql.ENUM("SundaySchool", "Abenet", name="lesson_level", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "mezmur",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False, unique=True),
        sa.Column("title", sa.String(length=150), nullable=False),
        sa.Column(
            "language",
            postgresql.ENUM("Geez", "Amharic", "English", name="mezmur_language", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "category",
            postgresql.ENUM("Liturgy", "Youth", "SpecialEvent", name="mezmur_category", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "rehearsal_day",
            postgresql.ENUM(
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                name="weekday_name",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("conductor_name", sa.String(length=120), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "abenet_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "parent_member_id",
            sa.Integer(),
            sa.ForeignKey("members.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("child_id", sa.Integer(), sa.ForeignKey("children.id", ondelete="SET NULL"), nullable=True),
        sa.Column("child_first_name", sa.String(length=120), nullable=False),
        sa.Column("child_last_name", sa.String(length=120), nullable=False),
        sa.Column("birth_date", sa.Date(), nullable=False),
        sa.Column(
            "service_stage",
            postgresql.ENUM("Alphabet", "Reading", "ForDeacons", name="abenet_service_stage", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column("monthly_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM("Active", "Paused", "Completed", "Cancelled", name="abenet_enrollment_status", create_type=False),
            nullable=False,
            server_default="Active",
            index=True,
        ),
        sa.Column("enrollment_date", sa.Date(), nullable=False),
        sa.Column("last_payment_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "sunday_school_enrollments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("guardian_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "class_level",
            postgresql.ENUM("Kindergarten", "Primary", "Intermediate", "Youth", name="sunday_class_level", create_type=False),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "status",
            postgresql.ENUM("Enrolled", "OnHold", "Completed", "Withdrawn", name="school_enrollment_status", create_type=False),
            nullable=False,
            server_default="Enrolled",
            index=True,
        ),
        sa.Column("mezmur_id", sa.Integer(), sa.ForeignKey("mezmur.id", ondelete="SET NULL"), nullable=True),
        sa.Column("enrollment_date", sa.Date(), nullable=False),
        sa.Column("expected_graduation", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_attended_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "sunday_school_attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "enrollment_id",
            sa.Integer(),
            sa.ForeignKey("sunday_school_enrollments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("lesson_date", sa.Date(), nullable=False, index=True),
        sa.Column(
            "status",
            postgresql.ENUM("Present", "Absent", "Excused", name="attendance_status", create_type=False),
            nullable=False,
            server_default="Present",
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.create_table(
        "abenet_enrollment_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "enrollment_id",
            sa.Integer(),
            sa.ForeignKey("abenet_enrollments.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "payment_id",
            sa.Integer(),
            sa.ForeignKey("payments.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )

    op.execute(
        """
        INSERT INTO payment_service_types (code, label, description, active, created_at, updated_at)
        SELECT 'AbenetSchool', 'Abenet School Tuition', 'Fixed tuition for the Abenet school program', TRUE, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM payment_service_types WHERE code = 'AbenetSchool');
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM payment_service_types WHERE code = 'AbenetSchool';")
    op.drop_table("abenet_enrollment_payments")
    op.drop_table("sunday_school_attendance")
    op.drop_table("sunday_school_enrollments")
    op.drop_table("abenet_enrollments")
    op.drop_table("mezmur")
    op.drop_table("lessons")

    for enum_name in reversed(list(ENUM_DEFINITIONS.keys())):
        op.execute(sa.text(f"DROP TYPE IF EXISTS {enum_name};"))
