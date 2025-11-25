"""mark seeded super admin

Revision ID: bbc8a3d5d8fa
Revises: a4c1aa1c1234
Create Date: 2025-11-21 05:26:00.000000
"""

from alembic import op

# revision identifiers, used by Alembic.
revision = "bbc8a3d5d8fa"
down_revision = "a4c1aa1c1234"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET is_super_admin = TRUE
        WHERE email = 'superadmin@example.com'
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE users
        SET is_super_admin = FALSE
        WHERE email = 'superadmin@example.com'
        """
    )
