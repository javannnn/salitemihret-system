"""Add donor identity fields to payments.

Revision ID: f7a2c9d4e8b1
Revises: c5f8a1d9e2b7
Create Date: 2026-05-21 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f7a2c9d4e8b1"
down_revision = "c5f8a1d9e2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("donor_first_name", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("donor_last_name", sa.String(length=120), nullable=True))
    op.add_column("payments", sa.Column("donor_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "donor_email")
    op.drop_column("payments", "donor_last_name")
    op.drop_column("payments", "donor_first_name")
