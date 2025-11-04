"""Membership domain enhancements: spouse/child fields, priests lookup."""

from alembic import op
import sqlalchemy as sa


revision = "0005_membership_requirements"
down_revision = "0004_child_promoted_at"
branch_labels = None
depends_on = None

member_marital_status = sa.Enum(
    "Single",
    "Married",
    "Divorced",
    "Widowed",
    "Separated",
    "Other",
    name="member_marital_status",
)

member_gender = sa.Enum("Male", "Female", "Other", name="member_gender", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    member_marital_status.create(bind, checkfirst=True)

    op.create_table(
        "priests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(length=150), nullable=False, unique=True),
    )

    op.add_column("members", sa.Column("baptismal_name", sa.String(length=150), nullable=True))
    op.add_column("members", sa.Column("marital_status", member_marital_status, nullable=True))
    op.add_column("members", sa.Column("address_street", sa.String(length=255), nullable=True))
    op.add_column("members", sa.Column("address_city", sa.String(length=120), nullable=True))
    op.add_column("members", sa.Column("address_region", sa.String(length=120), nullable=True))
    op.add_column("members", sa.Column("address_postal_code", sa.String(length=30), nullable=True))
    op.add_column("members", sa.Column("address_country", sa.String(length=120), nullable=True))
    op.add_column(
        "members",
        sa.Column("pays_contribution", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "members",
        sa.Column("household_size_override", sa.Integer(), nullable=True),
    )
    op.add_column(
        "members",
        sa.Column("has_father_confessor", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "members",
        sa.Column("father_confessor_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_members_father_confessor_id",
        "members",
        "priests",
        ["father_confessor_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column("spouses", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("spouses", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("spouses", sa.Column("gender", member_gender, nullable=True))
    op.add_column("spouses", sa.Column("country_of_birth", sa.String(length=120), nullable=True))

    op.add_column("children", sa.Column("first_name", sa.String(length=120), nullable=True))
    op.add_column("children", sa.Column("last_name", sa.String(length=120), nullable=True))
    op.add_column("children", sa.Column("gender", member_gender, nullable=True))
    op.add_column("children", sa.Column("country_of_birth", sa.String(length=120), nullable=True))

    op.alter_column("members", "pays_contribution", server_default=None)
    op.alter_column("members", "has_father_confessor", server_default=None)


def downgrade() -> None:
    op.drop_column("children", "country_of_birth")
    op.drop_column("children", "gender")
    op.drop_column("children", "last_name")
    op.drop_column("children", "first_name")

    op.drop_column("spouses", "country_of_birth")
    op.drop_column("spouses", "gender")
    op.drop_column("spouses", "last_name")
    op.drop_column("spouses", "first_name")

    op.drop_constraint("fk_members_father_confessor_id", "members", type_="foreignkey")
    op.drop_column("members", "father_confessor_id")
    op.drop_column("members", "has_father_confessor")
    op.drop_column("members", "household_size_override")
    op.drop_column("members", "pays_contribution")
    op.drop_column("members", "address_country")
    op.drop_column("members", "address_postal_code")
    op.drop_column("members", "address_region")
    op.drop_column("members", "address_city")
    op.drop_column("members", "address_street")
    op.drop_column("members", "marital_status")
    op.drop_column("members", "baptismal_name")

    op.drop_table("priests")

    bind = op.get_bind()
    member_marital_status.drop(bind, checkfirst=True)
