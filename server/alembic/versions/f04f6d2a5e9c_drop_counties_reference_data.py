"""Drop counties reference data and backfill newcomer county text.

Revision ID: f04f6d2a5e9c
Revises: e8a3c1f9d2b4
Create Date: 2025-12-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f04f6d2a5e9c"
down_revision = "e8a3c1f9d2b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            UPDATE newcomers
            SET county = c.name
            FROM counties c
            WHERE newcomers.county_id = c.id
              AND (newcomers.county IS NULL OR trim(newcomers.county) = '')
            """
        )
    )
    op.drop_constraint("fk_newcomers_county", "newcomers", type_="foreignkey")
    op.drop_column("newcomers", "county_id")
    op.drop_table("counties")


def downgrade() -> None:
    op.create_table(
        "counties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("name", name="uq_counties_name"),
    )
    op.create_index("ix_counties_name", "counties", ["name"], unique=True)
    op.add_column("newcomers", sa.Column("county_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_newcomers_county",
        "newcomers",
        "counties",
        ["county_id"],
        ["id"],
        ondelete="SET NULL",
    )
