"""Add sponsorship budget rounds.

Revision ID: 3b7a2c1d4f90
Revises: f04f6d2a5e9c
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b7a2c1d4f90"
down_revision = "f04f6d2a5e9c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sponsorship_budget_rounds",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("slot_budget", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("year", "round_number", name="uq_sponsorship_budget_rounds_year_round"),
    )
    op.create_index("ix_sponsorship_budget_rounds_year", "sponsorship_budget_rounds", ["year"])


def downgrade() -> None:
    op.drop_index("ix_sponsorship_budget_rounds_year", table_name="sponsorship_budget_rounds")
    op.drop_table("sponsorship_budget_rounds")
