"""add sponsorship volunteer and payment health helper columns

Revision ID: 8d3a9f4e7b2a
Revises: 9f33c5957c06
Create Date: 2025-02-14 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8d3a9f4e7b2a"
down_revision: Union[str, None] = "9f33c5957c06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("sponsorships", sa.Column("volunteer_services", sa.Text(), nullable=True))
    op.add_column("sponsorships", sa.Column("volunteer_service_other", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("sponsorships", "volunteer_service_other")
    op.drop_column("sponsorships", "volunteer_services")
