"""Add volunteer module tables and seed groups.

Revision ID: 5a1c9d2e7f44
Revises: 4c8e3b1a7d1f
Create Date: 2026-02-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "5a1c9d2e7f44"
down_revision = "4c8e3b1a7d1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "volunteer_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False, unique=True),
        sa.Column("team_lead_first_name", sa.String(length=100), nullable=True),
        sa.Column("team_lead_last_name", sa.String(length=100), nullable=True),
        sa.Column("team_lead_phone", sa.String(length=40), nullable=True),
        sa.Column("team_lead_email", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "volunteer_workers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("service_type", sa.Enum("Holiday", "GeneralService", name="volunteer_service_type"), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_id"], ["volunteer_groups.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_volunteer_workers_group_id", "volunteer_workers", ["group_id"])

    default_groups = [
        "Peter",
        "James",
        "John",
        "Andrew",
        "Philip",
        "Matthew",
        "Thomas",
        "James, the son of Alpheus",
        "Bartholomew",
        "Judas Thaddeus",
        "Simon Zelotes",
        "Judas Iscariot",
    ]
    for name in default_groups:
        op.execute(
            sa.text(
                "INSERT INTO volunteer_groups (name, created_at, updated_at) VALUES (:name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
            ).bindparams(name=name)
        )


def downgrade() -> None:
    op.drop_index("ix_volunteer_workers_group_id", table_name="volunteer_workers")
    op.drop_table("volunteer_workers")
    op.drop_table("volunteer_groups")
    op.execute(sa.text("DROP TYPE IF EXISTS volunteer_service_type"))
