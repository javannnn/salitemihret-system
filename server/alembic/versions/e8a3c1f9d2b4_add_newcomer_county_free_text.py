"""Add free-text county field for newcomers.

Revision ID: e8a3c1f9d2b4
Revises: c9a2b34c8c1e
Create Date: 2025-12-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e8a3c1f9d2b4"
down_revision = "c9a2b34c8c1e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("newcomers", sa.Column("county", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("newcomers", "county")
