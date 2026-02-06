"""Add budget round reference to sponsorships.

Revision ID: 4c8e3b1a7d1f
Revises: 3b7a2c1d4f90
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "4c8e3b1a7d1f"
down_revision = "3b7a2c1d4f90"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sponsorships", sa.Column("budget_round_id", sa.Integer(), nullable=True))
    op.create_index("ix_sponsorships_budget_round_id", "sponsorships", ["budget_round_id"])
    op.create_foreign_key(
        "fk_sponsorships_budget_round_id",
        "sponsorships",
        "sponsorship_budget_rounds",
        ["budget_round_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sponsorships_budget_round_id", "sponsorships", type_="foreignkey")
    op.drop_index("ix_sponsorships_budget_round_id", table_name="sponsorships")
    op.drop_column("sponsorships", "budget_round_id")
