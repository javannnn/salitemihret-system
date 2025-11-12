"""Add sponsorships and newcomers tables with enums"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "9b4b62ffcc0e"
down_revision = "4e8d19244648"
branch_labels = None
depends_on = None


def _ensure_enum(name: str, values: list[str]) -> None:
    enum_values = ", ".join(f"''{value}''" for value in values)
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN
                EXECUTE 'CREATE TYPE {name} AS ENUM ({enum_values})';
            END IF;
        END
        $$;
        """
    )


def upgrade() -> None:
    _ensure_enum("newcomer_status", ["New", "InProgress", "Sponsored", "Converted", "Closed"])
    _ensure_enum("sponsorship_status", ["Draft", "Active", "Suspended", "Completed", "Closed"])
    _ensure_enum("sponsorship_frequency", ["OneTime", "Monthly", "Quarterly", "Yearly"])
    _ensure_enum("sponsorship_decision", ["Approved", "Rejected", "Pending"])

    newcomer_status = postgresql.ENUM(
        "New",
        "InProgress",
        "Sponsored",
        "Converted",
        "Closed",
        name="newcomer_status",
        create_type=False,
    )
    sponsorship_status = postgresql.ENUM(
        "Draft",
        "Active",
        "Suspended",
        "Completed",
        "Closed",
        name="sponsorship_status",
        create_type=False,
    )
    sponsorship_frequency = postgresql.ENUM(
        "OneTime",
        "Monthly",
        "Quarterly",
        "Yearly",
        name="sponsorship_frequency",
        create_type=False,
    )
    sponsorship_decision = postgresql.ENUM(
        "Approved",
        "Rejected",
        "Pending",
        name="sponsorship_decision",
        create_type=False,
    )

    op.create_table(
        "newcomers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("preferred_language", sa.String(length=60), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("contact_email", sa.String(length=255), nullable=True),
        sa.Column("family_size", sa.Integer(), nullable=True),
        sa.Column("service_type", sa.String(length=120), nullable=True),
        sa.Column("arrival_date", sa.Date(), nullable=False),
        sa.Column("country", sa.String(length=120), nullable=True),
        sa.Column("temporary_address", sa.String(length=255), nullable=True),
        sa.Column("referred_by", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", newcomer_status, nullable=False, server_default="New"),
        sa.Column("sponsored_by_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("father_of_repentance_id", sa.Integer(), sa.ForeignKey("priests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_owner_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("followup_due_date", sa.Date(), nullable=True),
        sa.Column("converted_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_newcomers_status", "newcomers", ["status"])
    op.create_index("ix_newcomers_arrival_date", "newcomers", ["arrival_date"])

    op.create_table(
        "sponsorships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sponsor_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("beneficiary_member_id", sa.Integer(), sa.ForeignKey("members.id", ondelete="SET NULL"), nullable=True),
        sa.Column("newcomer_id", sa.Integer(), sa.ForeignKey("newcomers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("beneficiary_name", sa.String(length=255), nullable=False),
        sa.Column("father_of_repentance_id", sa.Integer(), sa.ForeignKey("priests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("volunteer_service", sa.String(length=255), nullable=True),
        sa.Column("payment_information", sa.String(length=255), nullable=True),
        sa.Column("last_sponsored_date", sa.Date(), nullable=True),
        sa.Column("frequency", sponsorship_frequency, nullable=False, server_default="Monthly"),
        sa.Column("last_status", sponsorship_decision, nullable=True),
        sa.Column("last_status_reason", sa.String(length=255), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("status", sponsorship_status, nullable=False, server_default="Draft"),
        sa.Column("monthly_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("program", sa.String(length=120), nullable=True),
        sa.Column("budget_month", sa.Integer(), nullable=True),
        sa.Column("budget_year", sa.Integer(), nullable=True),
        sa.Column("budget_amount", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("budget_slots", sa.Integer(), nullable=True),
        sa.Column("used_slots", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("reminder_last_sent", sa.DateTime(), nullable=True),
        sa.Column("reminder_next_due", sa.DateTime(), nullable=True),
        sa.Column("assigned_staff_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("budget_month BETWEEN 1 AND 12", name="ck_sponsorship_budget_month"),
    )
    op.create_index("ix_sponsorships_status", "sponsorships", ["status"])
    op.create_index("ix_sponsorships_program", "sponsorships", ["program"])
    op.create_index("ix_sponsorships_sponsor", "sponsorships", ["sponsor_member_id"])


def downgrade() -> None:
    op.drop_index("ix_sponsorships_sponsor", table_name="sponsorships")
    op.drop_index("ix_sponsorships_program", table_name="sponsorships")
    op.drop_index("ix_sponsorships_status", table_name="sponsorships")
    op.drop_table("sponsorships")

    op.drop_index("ix_newcomers_arrival_date", table_name="newcomers")
    op.drop_index("ix_newcomers_status", table_name="newcomers")
    op.drop_table("newcomers")

    bind = op.get_bind()
    sa.Enum(name="sponsorship_decision").drop(bind, checkfirst=True)
    sa.Enum(name="sponsorship_frequency").drop(bind, checkfirst=True)
    sa.Enum(name="sponsorship_status").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_status").drop(bind, checkfirst=True)
