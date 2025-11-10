"""Membership tweaks and constraints alignment.

Revision ID: 4e8d19244648
Revises: 718d5f0680b9
Create Date: 2025-11-10 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "4e8d19244648"
down_revision = "718d5f0680b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make contribution fields required (matches current model/seed expectations)
    op.alter_column(
        "members",
        "contribution_amount",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=False,
    )
    op.alter_column(
        "members",
        "contribution_currency",
        existing_type=sa.VARCHAR(length=3),
        nullable=False,
    )

    # Drop unused/legacy index if it exists
    op.drop_index("ix_payments_posted_at", table_name="payments")

    # Align priests.created_at to naive DateTime if that’s what the model uses
    op.alter_column(
        "priests",
        "created_at",
        existing_type=postgresql.TIMESTAMP(timezone=True),
        type_=sa.DateTime(),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )


def downgrade() -> None:
    # Revert priests.created_at back to timestamptz
    op.alter_column(
        "priests",
        "created_at",
        existing_type=sa.DateTime(),
        type_=postgresql.TIMESTAMP(timezone=True),
        existing_nullable=False,
        existing_server_default=sa.text("now()"),
    )

    # Restore the dropped index
    op.create_index("ix_payments_posted_at", "payments", ["posted_at"], unique=False)

    # Allow nullable again on contributions
    op.alter_column(
        "members",
        "contribution_currency",
        existing_type=sa.VARCHAR(length=3),
        nullable=True,
    )
    op.alter_column(
        "members",
        "contribution_amount",
        existing_type=sa.Numeric(precision=10, scale=2),
        nullable=True,
    )

    # Do NOT touch uq_member_ministry / uq_member_tag here.
    # Those are managed by earlier migrations / existing schema.
