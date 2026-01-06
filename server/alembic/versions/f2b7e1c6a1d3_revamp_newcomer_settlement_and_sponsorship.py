"""Revamp newcomer settlement and sponsorship data model.

Revision ID: f2b7e1c6a1d3
Revises: 4dec243307b4
Create Date: 2025-11-29 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "f2b7e1c6a1d3"
down_revision = "4dec243307b4"
branch_labels = None
depends_on = None


def _create_enum_if_not_exists(name: str, values: list[str]) -> None:
    quoted_values = ", ".join(f"'{value}'" for value in values)
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{name}') THEN
                CREATE TYPE {name} AS ENUM ({quoted_values});
            END IF;
        END
        $$;
        """
    )


def _add_enum_values(enum_name: str, values: list[str]) -> None:
    for value in values:
        op.execute(
            f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = '{enum_name}' AND e.enumlabel = '{value}'
                ) THEN
                    ALTER TYPE {enum_name} ADD VALUE '{value}';
                END IF;
            END
            $$;
            """
        )


def upgrade() -> None:
    _create_enum_if_not_exists("newcomer_household_type", ["Individual", "Family"])
    _create_enum_if_not_exists("newcomer_interaction_type", ["Call", "Visit", "Meeting", "Note", "Other"])
    _create_enum_if_not_exists("newcomer_interaction_visibility", ["Restricted", "Shared"])
    _create_enum_if_not_exists("newcomer_address_type", ["Temporary", "Current"])
    _create_enum_if_not_exists("newcomer_audit_action", ["StatusChange", "Reopen", "Inactivate", "Reactivate"])
    _create_enum_if_not_exists("sponsorship_audit_action", ["StatusChange", "Approval", "Rejection", "Suspension", "Reactivation"])

    _add_enum_values("newcomer_status", ["Contacted", "Assigned", "Settled"])
    _add_enum_values("sponsorship_status", ["Submitted", "Approved", "Rejected"])

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

    op.execute("CREATE SEQUENCE IF NOT EXISTS newcomer_code_seq")

    op.add_column(
        "newcomers",
        sa.Column(
            "newcomer_code",
            sa.String(length=20),
            nullable=True,
            server_default=sa.text("concat('NC-', lpad(nextval('newcomer_code_seq')::text, 6, '0'))"),
        ),
    )
    op.add_column(
        "newcomers",
        sa.Column(
            "household_type",
            postgresql.ENUM("Individual", "Family", name="newcomer_household_type", create_type=False),
            nullable=False,
            server_default="Individual",
        ),
    )
    op.add_column(
        "newcomers",
        sa.Column("interpreter_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("newcomers", sa.Column("contact_whatsapp", sa.String(length=50), nullable=True))
    op.add_column("newcomers", sa.Column("temporary_address_street", sa.String(length=255), nullable=True))
    op.add_column("newcomers", sa.Column("temporary_address_city", sa.String(length=120), nullable=True))
    op.add_column("newcomers", sa.Column("temporary_address_province", sa.String(length=120), nullable=True))
    op.add_column("newcomers", sa.Column("temporary_address_postal_code", sa.String(length=20), nullable=True))
    op.add_column("newcomers", sa.Column("current_address_street", sa.String(length=255), nullable=True))
    op.add_column("newcomers", sa.Column("current_address_city", sa.String(length=120), nullable=True))
    op.add_column("newcomers", sa.Column("current_address_province", sa.String(length=120), nullable=True))
    op.add_column("newcomers", sa.Column("current_address_postal_code", sa.String(length=20), nullable=True))
    op.add_column("newcomers", sa.Column("county_id", sa.Integer(), nullable=True))
    op.add_column("newcomers", sa.Column("past_profession", sa.Text(), nullable=True))
    op.add_column(
        "newcomers",
        sa.Column("is_inactive", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("newcomers", sa.Column("inactive_reason", sa.Text(), nullable=True))
    op.add_column("newcomers", sa.Column("inactive_at", sa.DateTime(), nullable=True))
    op.add_column("newcomers", sa.Column("inactive_by_id", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_newcomers_county",
        "newcomers",
        "counties",
        ["county_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_newcomers_inactive_by",
        "newcomers",
        "users",
        ["inactive_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute("UPDATE newcomers SET status = 'InProgress' WHERE status = 'Sponsored'")
    op.execute("UPDATE newcomers SET status = 'Closed' WHERE status = 'Converted'")
    op.execute("UPDATE newcomers SET status = 'Closed' WHERE converted_member_id IS NOT NULL AND status != 'Closed'")
    op.execute(
        "UPDATE newcomers SET household_type = 'Family' WHERE family_size IS NOT NULL AND family_size > 1"
    )
    op.execute(
        "UPDATE newcomers SET newcomer_code = concat('NC-', lpad(nextval('newcomer_code_seq')::text, 6, '0')) "
        "WHERE newcomer_code IS NULL"
    )

    op.alter_column("newcomers", "newcomer_code", nullable=False)
    op.create_unique_constraint("uq_newcomers_newcomer_code", "newcomers", ["newcomer_code"])

    op.add_column("sponsorships", sa.Column("submitted_at", sa.DateTime(), nullable=True))
    op.add_column("sponsorships", sa.Column("submitted_by_id", sa.Integer(), nullable=True))
    op.add_column("sponsorships", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("sponsorships", sa.Column("approved_by_id", sa.Integer(), nullable=True))
    op.add_column("sponsorships", sa.Column("rejected_at", sa.DateTime(), nullable=True))
    op.add_column("sponsorships", sa.Column("rejected_by_id", sa.Integer(), nullable=True))
    op.add_column("sponsorships", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column(
        "sponsorships",
        sa.Column("received_amount", sa.Numeric(precision=12, scale=2), nullable=False, server_default="0"),
    )

    op.create_foreign_key(
        "fk_sponsorships_submitted_by",
        "sponsorships",
        "users",
        ["submitted_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sponsorships_approved_by",
        "sponsorships",
        "users",
        ["approved_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sponsorships_rejected_by",
        "sponsorships",
        "users",
        ["rejected_by_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute("UPDATE sponsorships SET status = 'Completed' WHERE status = 'Closed'")

    op.create_table(
        "newcomer_address_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("newcomer_id", sa.Integer(), sa.ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "address_type",
            postgresql.ENUM("Temporary", "Current", name="newcomer_address_type", create_type=False),
            nullable=False,
        ),
        sa.Column("street", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("province", sa.String(length=120), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index(
        "ix_newcomer_address_history_newcomer",
        "newcomer_address_history",
        ["newcomer_id"],
    )

    op.create_table(
        "newcomer_interactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("newcomer_id", sa.Integer(), sa.ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "interaction_type",
            postgresql.ENUM("Call", "Visit", "Meeting", "Note", "Other", name="newcomer_interaction_type", create_type=False),
            nullable=False,
            server_default="Note",
        ),
        sa.Column(
            "visibility",
            postgresql.ENUM("Restricted", "Shared", name="newcomer_interaction_visibility", create_type=False),
            nullable=False,
            server_default="Restricted",
        ),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_newcomer_interactions_newcomer", "newcomer_interactions", ["newcomer_id"])

    op.create_table(
        "newcomer_status_audits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("newcomer_id", sa.Integer(), sa.ForeignKey("newcomers.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "action",
            postgresql.ENUM(
                "StatusChange",
                "Reopen",
                "Inactivate",
                "Reactivate",
                name="newcomer_audit_action",
                create_type=False,
            ),
            nullable=False,
            server_default="StatusChange",
        ),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_newcomer_status_audits_newcomer", "newcomer_status_audits", ["newcomer_id"])

    op.create_table(
        "sponsorship_status_audits",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sponsorship_id", sa.Integer(), sa.ForeignKey("sponsorships.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "action",
            postgresql.ENUM(
                "StatusChange",
                "Approval",
                "Rejection",
                "Suspension",
                "Reactivation",
                name="sponsorship_audit_action",
                create_type=False,
            ),
            nullable=False,
            server_default="StatusChange",
        ),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "ix_sponsorship_status_audits_sponsorship",
        "sponsorship_status_audits",
        ["sponsorship_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_sponsorship_status_audits_sponsorship", table_name="sponsorship_status_audits")
    op.drop_table("sponsorship_status_audits")
    op.drop_index("ix_newcomer_status_audits_newcomer", table_name="newcomer_status_audits")
    op.drop_table("newcomer_status_audits")
    op.drop_index("ix_newcomer_interactions_newcomer", table_name="newcomer_interactions")
    op.drop_table("newcomer_interactions")
    op.drop_index("ix_newcomer_address_history_newcomer", table_name="newcomer_address_history")
    op.drop_table("newcomer_address_history")

    op.drop_constraint("fk_sponsorships_rejected_by", "sponsorships", type_="foreignkey")
    op.drop_constraint("fk_sponsorships_approved_by", "sponsorships", type_="foreignkey")
    op.drop_constraint("fk_sponsorships_submitted_by", "sponsorships", type_="foreignkey")
    op.drop_column("sponsorships", "rejection_reason")
    op.drop_column("sponsorships", "rejected_by_id")
    op.drop_column("sponsorships", "rejected_at")
    op.drop_column("sponsorships", "approved_by_id")
    op.drop_column("sponsorships", "approved_at")
    op.drop_column("sponsorships", "submitted_by_id")
    op.drop_column("sponsorships", "submitted_at")
    op.drop_column("sponsorships", "received_amount")

    op.drop_constraint("fk_newcomers_inactive_by", "newcomers", type_="foreignkey")
    op.drop_constraint("fk_newcomers_county", "newcomers", type_="foreignkey")
    op.drop_constraint("uq_newcomers_newcomer_code", "newcomers", type_="unique")
    op.drop_column("newcomers", "inactive_by_id")
    op.drop_column("newcomers", "inactive_at")
    op.drop_column("newcomers", "inactive_reason")
    op.drop_column("newcomers", "is_inactive")
    op.drop_column("newcomers", "past_profession")
    op.drop_column("newcomers", "county_id")
    op.drop_column("newcomers", "current_address_postal_code")
    op.drop_column("newcomers", "current_address_province")
    op.drop_column("newcomers", "current_address_city")
    op.drop_column("newcomers", "current_address_street")
    op.drop_column("newcomers", "temporary_address_postal_code")
    op.drop_column("newcomers", "temporary_address_province")
    op.drop_column("newcomers", "temporary_address_city")
    op.drop_column("newcomers", "temporary_address_street")
    op.drop_column("newcomers", "contact_whatsapp")
    op.drop_column("newcomers", "interpreter_required")
    op.drop_column("newcomers", "household_type")
    op.drop_column("newcomers", "newcomer_code")

    op.execute("DROP SEQUENCE IF EXISTS newcomer_code_seq")

    op.drop_index("ix_counties_name", table_name="counties")
    op.drop_table("counties")

    bind = op.get_bind()
    sa.Enum(name="sponsorship_audit_action").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_audit_action").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_address_type").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_interaction_visibility").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_interaction_type").drop(bind, checkfirst=True)
    sa.Enum(name="newcomer_household_type").drop(bind, checkfirst=True)
