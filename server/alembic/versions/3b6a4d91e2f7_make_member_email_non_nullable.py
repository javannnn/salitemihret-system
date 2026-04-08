"""Backfill member emails and make email non-null.

Revision ID: 3b6a4d91e2f7
Revises: 9d4f2a6b7c81
Create Date: 2026-03-22 00:00:01.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "3b6a4d91e2f7"
down_revision = "9d4f2a6b7c81"
branch_labels = None
depends_on = None


def _mock_email(member_id: int) -> str:
    return f"mock+member-{member_id}@example.invalid"


def upgrade() -> None:
    bind = op.get_bind()
    members = sa.table(
        "members",
        sa.column("id", sa.Integer),
        sa.column("email", sa.String(length=255)),
    )

    missing_member_ids = [
        row.id
        for row in bind.execute(
            sa.select(members.c.id).where(
                sa.or_(
                    members.c.email.is_(None),
                    sa.func.trim(members.c.email) == "",
                )
            )
        )
    ]
    for member_id in missing_member_ids:
        bind.execute(
            sa.update(members)
            .where(members.c.id == member_id)
            .values(email=_mock_email(member_id))
        )

    op.alter_column("members", "email", existing_type=sa.String(length=255), nullable=False)


def downgrade() -> None:
    op.alter_column("members", "email", existing_type=sa.String(length=255), nullable=True)
