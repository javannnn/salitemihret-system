"""Payments ledger base tables."""

from alembic import op
import sqlalchemy as sa


revision = "0007_payments_ledger"
down_revision = "6e60d4009c53"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_service_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False, unique=True),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CAD"),
        sa.Column("method", sa.String(length=100), nullable=True),
        sa.Column("memo", sa.String(length=255), nullable=True),
        sa.Column("service_type_id", sa.Integer(), sa.ForeignKey("payment_service_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("household_id", sa.Integer(), sa.ForeignKey("households.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("posted_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("correction_of_id", sa.Integer(), sa.ForeignKey("payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("correction_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_payments_member_id", "payments", ["member_id"])
    op.create_index("ix_payments_household_id", "payments", ["household_id"])
    op.create_index("ix_payments_posted_at", "payments", ["posted_at"])

    op.create_table(
        "payment_receipts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("reference_number", sa.String(length=120), nullable=True),
        sa.Column("attachment_path", sa.String(length=255), nullable=True),
        sa.Column("issued_at", sa.DateTime(), nullable=False, server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("payment_receipts")
    op.drop_index("ix_payments_posted_at", table_name="payments")
    op.drop_index("ix_payments_household_id", table_name="payments")
    op.drop_index("ix_payments_member_id", table_name="payments")
    op.drop_table("payments")
    op.drop_table("payment_service_types")
