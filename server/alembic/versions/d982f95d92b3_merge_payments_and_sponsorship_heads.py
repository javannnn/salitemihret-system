"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision|comma,n}
Create Date: ${create_date}
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd982f95d92b3'
down_revision = ('0008_payment_status_due_date', '9b4b62ffcc0e')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
