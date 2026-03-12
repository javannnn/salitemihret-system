"""Add role-level module and field permission configs.

Revision ID: 1f4e9c7a2b1d
Revises: 7d1b3a9c2e4f
Create Date: 2026-03-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "1f4e9c7a2b1d"
down_revision = "7d1b3a9c2e4f"
branch_labels = None
depends_on = None


SYSTEM_ROLE_NAMES = (
    "SuperAdmin",
    "Admin",
    "PublicRelations",
    "Registrar",
    "Clerk",
    "OfficeAdmin",
    "FinanceAdmin",
    "SponsorshipCommittee",
    "SchoolAdmin",
    "SundaySchoolViewer",
    "SundaySchoolAdmin",
    "SundaySchoolApprover",
    "Priest",
)


def upgrade() -> None:
    op.add_column(
        "roles",
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("roles", sa.Column("module_permissions", sa.JSON(), nullable=True))
    op.add_column("roles", sa.Column("field_permissions", sa.JSON(), nullable=True))

    quoted = ", ".join(f"'{name}'" for name in SYSTEM_ROLE_NAMES)
    op.execute(sa.text(f"UPDATE roles SET is_system = TRUE WHERE name IN ({quoted})"))
    op.alter_column("roles", "is_system", server_default=None)


def downgrade() -> None:
    op.drop_column("roles", "field_permissions")
    op.drop_column("roles", "module_permissions")
    op.drop_column("roles", "is_system")
