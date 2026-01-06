"""Case-centric sponsorship and newcomer updates.

Revision ID: c9a2b34c8c1e
Revises: f2b7e1c6a1d3
Create Date: 2025-12-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "c9a2b34c8c1e"
down_revision = "f2b7e1c6a1d3"
branch_labels = None
depends_on = None


def _add_enum_values(enum_name: str, values: list[str]) -> None:
    for value in values:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = '{enum_name}' AND e.enumlabel = '{value}'
                ) THEN
                    ALTER TYPE {enum_name} ADD VALUE '{value}';
                END IF;
            END
            $$;
            """
        )


def upgrade() -> None:
    _add_enum_values("newcomer_audit_action", ["Assignment", "SponsorshipLink", "SponsorshipUnlink"])
    _add_enum_values("sponsorship_audit_action", ["BeneficiaryChange"])

    op.add_column("newcomers", sa.Column("inactive_notes", sa.Text(), nullable=True))

    op.create_table(
        "sponsorship_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sponsorship_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["sponsorship_id"], ["sponsorships.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_sponsorship_notes_sponsorship_id", "sponsorship_notes", ["sponsorship_id"])

    op.alter_column(
        "sponsorships",
        "frequency",
        existing_type=postgresql.ENUM("OneTime", "Monthly", "Quarterly", "Yearly", name="sponsorship_frequency", create_type=False),
        type_=sa.String(length=50),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "sponsorships",
        "frequency",
        existing_type=sa.String(length=50),
        type_=postgresql.ENUM("OneTime", "Monthly", "Quarterly", "Yearly", name="sponsorship_frequency", create_type=False),
        existing_nullable=False,
    )

    op.drop_index("ix_sponsorship_notes_sponsorship_id", table_name="sponsorship_notes")
    op.drop_table("sponsorship_notes")

    op.drop_column("newcomers", "inactive_notes")
