"""Add contribution exception attachment path to members.

Revision ID: 6f2d8c3b9e11
Revises: 5a1c9d2e7f44
Create Date: 2026-02-12 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "6f2d8c3b9e11"
down_revision = "5a1c9d2e7f44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("members", sa.Column("contribution_exception_attachment_path", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("members", "contribution_exception_attachment_path")
