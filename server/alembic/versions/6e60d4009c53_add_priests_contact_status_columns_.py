"""Add priests contact/status columns (idempotent)"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "6e60d4009c53"
down_revision = "0006_contribution_enforcement"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # Safety: skip if table doesn't exist
    if "priests" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("priests")}

    if "phone" not in cols:
        op.add_column("priests", sa.Column("phone", sa.String(length=50), nullable=True))
    if "email" not in cols:
        op.add_column("priests", sa.Column("email", sa.String(length=255), nullable=True))
    if "status" not in cols:
        op.add_column(
            "priests",
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        )
    if "created_at" not in cols:
        op.add_column(
            "priests",
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "priests" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("priests")}

    if "created_at" in cols:
        op.drop_column("priests", "created_at")
    if "status" in cols:
        op.drop_column("priests", "status")
    if "email" in cols:
        op.drop_column("priests", "email")
    if "phone" in cols:
        op.drop_column("priests", "phone")
