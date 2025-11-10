"""Add payment status and due date."""

from alembic import op
import sqlalchemy as sa


revision = "0008_payment_status_due_date"
down_revision = "0007_payments_ledger"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("due_date", sa.Date(), nullable=True))
    op.add_column("payments", sa.Column("status", sa.String(length=20), nullable=False, server_default="Completed"))
    op.execute("UPDATE payments SET status = 'Completed' WHERE status IS NULL")
    op.alter_column("payments", "status", server_default=None)


def downgrade() -> None:
    op.drop_column("payments", "status")
    op.drop_column("payments", "due_date")
