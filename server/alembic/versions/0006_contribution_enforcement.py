"""Enforce membership contributions and record payment history."""

from alembic import op
import sqlalchemy as sa


revision = "0006_contribution_enforcement"
down_revision = "0005_membership_requirements"
branch_labels = None
depends_on = None


contribution_exception_enum = sa.Enum(
    "LowIncome",
    "Senior",
    "Student",
    "Other",
    name="member_contribution_exception_reason",
)


def upgrade() -> None:
    bind = op.get_bind()

    contribution_exception_enum.create(bind, checkfirst=True)

    op.add_column(
        "members",
        sa.Column("contribution_currency", sa.String(length=3), nullable=False, server_default="CAD"),
    )
    op.add_column(
        "members",
        sa.Column("contribution_exception_reason", contribution_exception_enum, nullable=True),
    )

    op.execute("UPDATE members SET contribution_amount = 75 WHERE contribution_amount IS NULL")
    op.execute("UPDATE members SET contribution_currency = 'CAD' WHERE contribution_currency IS NULL")
    op.execute("UPDATE members SET pays_contribution = TRUE WHERE pays_contribution IS DISTINCT FROM TRUE")

    op.alter_column(
        "members",
        "contribution_amount",
        existing_type=sa.Numeric(10, 2),
        nullable=False,
        server_default=sa.text("75"),
    )

    op.create_table(
        "member_contribution_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CAD"),
        sa.Column("paid_at", sa.Date(), nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("method", sa.String(length=100), nullable=True),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )

    op.execute("ALTER TABLE member_contribution_payments ALTER COLUMN currency DROP DEFAULT")
    op.execute("ALTER TABLE members ALTER COLUMN contribution_currency DROP DEFAULT")


def downgrade() -> None:
    op.drop_table("member_contribution_payments")

    op.alter_column(
        "members",
        "contribution_amount",
        existing_type=sa.Numeric(10, 2),
        nullable=True,
        server_default=None,
    )

    op.drop_column("members", "contribution_exception_reason")
    op.drop_column("members", "contribution_currency")

    bind = op.get_bind()
    contribution_exception_enum.drop(bind, checkfirst=True)
