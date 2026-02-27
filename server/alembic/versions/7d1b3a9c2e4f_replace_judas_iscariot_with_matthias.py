"""Replace Judas Iscariot volunteer group with Matthias.

Revision ID: 7d1b3a9c2e4f
Revises: 6f2d8c3b9e11
Create Date: 2026-02-27 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7d1b3a9c2e4f"
down_revision = "6f2d8c3b9e11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE volunteer_groups
            SET name = 'Matthias', updated_at = CURRENT_TIMESTAMP
            WHERE name = 'Judas Iscariot'
              AND NOT EXISTS (
                SELECT 1 FROM volunteer_groups WHERE name = 'Matthias'
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            DELETE FROM volunteer_groups
            WHERE name = 'Judas Iscariot'
              AND EXISTS (
                SELECT 1 FROM volunteer_groups WHERE name = 'Matthias'
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE volunteer_groups
            SET name = 'Judas Iscariot', updated_at = CURRENT_TIMESTAMP
            WHERE name = 'Matthias'
              AND NOT EXISTS (
                SELECT 1 FROM volunteer_groups WHERE name = 'Judas Iscariot'
              )
            """
        )
    )
