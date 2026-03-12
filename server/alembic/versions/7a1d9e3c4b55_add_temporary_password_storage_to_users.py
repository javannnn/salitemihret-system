"""Add temporary password storage to users.

Revision ID: 7a1d9e3c4b55
Revises: 6c14d8e5ab21
Create Date: 2026-03-11 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7a1d9e3c4b55"
down_revision = "6c14d8e5ab21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("temporary_password_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("temporary_password_issued_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "temporary_password_issued_at")
    op.drop_column("users", "temporary_password_encrypted")
