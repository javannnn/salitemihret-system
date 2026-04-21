"""add parish councils module

Revision ID: a9e7c4d2b6f1
Revises: b1c2d3e4f567
Create Date: 2026-04-21 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "a9e7c4d2b6f1"
down_revision = "b1c2d3e4f567"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "parish_council_departments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum("Active", "Inactive", name="parish_council_department_status"), nullable=False, server_default="Active"),
        sa.Column("minimum_age", sa.Integer(), nullable=False, server_default="13"),
        sa.Column("lead_member_id", sa.Integer(), nullable=True),
        sa.Column("lead_first_name", sa.String(length=100), nullable=True),
        sa.Column("lead_last_name", sa.String(length=100), nullable=True),
        sa.Column("lead_email", sa.String(length=255), nullable=True),
        sa.Column("lead_phone", sa.String(length=40), nullable=True),
        sa.Column("lead_term_start", sa.Date(), nullable=True),
        sa.Column("lead_term_end", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["lead_member_id"], ["members.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_parish_council_departments_name", "parish_council_departments", ["name"], unique=True)
    op.create_index("ix_parish_council_departments_status", "parish_council_departments", ["status"], unique=False)
    op.create_index("ix_parish_council_departments_lead_member_id", "parish_council_departments", ["lead_member_id"], unique=False)

    op.create_table(
        "parish_council_assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("trainee_member_id", sa.Integer(), nullable=True),
        sa.Column("trainee_first_name", sa.String(length=100), nullable=False),
        sa.Column("trainee_last_name", sa.String(length=100), nullable=False),
        sa.Column("trainee_email", sa.String(length=255), nullable=True),
        sa.Column("trainee_phone", sa.String(length=40), nullable=True),
        sa.Column("trainee_birth_date", sa.Date(), nullable=True),
        sa.Column("training_from", sa.Date(), nullable=False),
        sa.Column("training_to", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("Planned", "Active", "Completed", "Cancelled", "OnHold", name="parish_council_assignment_status"),
            nullable=False,
            server_default="Planned",
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["department_id"], ["parish_council_departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["trainee_member_id"], ["members.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_parish_council_assignments_department_id", "parish_council_assignments", ["department_id"], unique=False)
    op.create_index("ix_parish_council_assignments_trainee_member_id", "parish_council_assignments", ["trainee_member_id"], unique=False)
    op.create_index("ix_parish_council_assignments_training_from", "parish_council_assignments", ["training_from"], unique=False)
    op.create_index("ix_parish_council_assignments_training_to", "parish_council_assignments", ["training_to"], unique=False)
    op.create_index("ix_parish_council_assignments_status", "parish_council_assignments", ["status"], unique=False)

    op.create_table(
        "parish_council_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("assignment_id", sa.Integer(), nullable=True),
        sa.Column(
            "entity_type",
            sa.Enum("Department", "Assignment", name="parish_council_audit_entity_type"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=True),
        sa.Column("after_state", sa.JSON(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["department_id"], ["parish_council_departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignment_id"], ["parish_council_assignments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_parish_council_audit_events_department_id", "parish_council_audit_events", ["department_id"], unique=False)
    op.create_index("ix_parish_council_audit_events_assignment_id", "parish_council_audit_events", ["assignment_id"], unique=False)
    op.create_index("ix_parish_council_audit_events_created_at", "parish_council_audit_events", ["created_at"], unique=False)

    op.execute(
        sa.text(
            """
            INSERT INTO roles (name, is_system)
            SELECT 'ParishCouncilAdmin', TRUE
            WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'ParishCouncilAdmin');
            """
        )
    )

    default_departments = (
        ("Office of Chairman", "Leadership office coordinating parish council direction and governance.", 13),
        ("Finance Department", "Financial stewardship, budgeting, and contribution oversight.", 13),
        ("Public Relation", "Communication, community visibility, and member engagement.", 13),
        ("Gospel Department", "Gospel and outreach coordination across parish programs.", 0),
        ("Development and Property", "Facilities, capital projects, and property stewardship.", 13),
        ("Sunday School Teacher", "Sunday school teaching leadership and trainee mentorship.", 13),
    )
    for name, description, minimum_age in default_departments:
        op.execute(
            sa.text(
                """
                INSERT INTO parish_council_departments (name, description, minimum_age, status, created_at, updated_at)
                SELECT :name, :description, :minimum_age, 'Active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                WHERE NOT EXISTS (
                    SELECT 1 FROM parish_council_departments WHERE name = :name
                );
                """
            ).bindparams(name=name, description=description, minimum_age=minimum_age)
        )


def downgrade() -> None:
    op.drop_index("ix_parish_council_audit_events_created_at", table_name="parish_council_audit_events")
    op.drop_index("ix_parish_council_audit_events_assignment_id", table_name="parish_council_audit_events")
    op.drop_index("ix_parish_council_audit_events_department_id", table_name="parish_council_audit_events")
    op.drop_table("parish_council_audit_events")

    op.drop_index("ix_parish_council_assignments_status", table_name="parish_council_assignments")
    op.drop_index("ix_parish_council_assignments_training_to", table_name="parish_council_assignments")
    op.drop_index("ix_parish_council_assignments_training_from", table_name="parish_council_assignments")
    op.drop_index("ix_parish_council_assignments_trainee_member_id", table_name="parish_council_assignments")
    op.drop_index("ix_parish_council_assignments_department_id", table_name="parish_council_assignments")
    op.drop_table("parish_council_assignments")

    op.drop_index("ix_parish_council_departments_lead_member_id", table_name="parish_council_departments")
    op.drop_index("ix_parish_council_departments_status", table_name="parish_council_departments")
    op.drop_index("ix_parish_council_departments_name", table_name="parish_council_departments")
    op.drop_table("parish_council_departments")

    op.execute(sa.text("DROP TYPE IF EXISTS parish_council_audit_entity_type"))
    op.execute(sa.text("DROP TYPE IF EXISTS parish_council_assignment_status"))
    op.execute(sa.text("DROP TYPE IF EXISTS parish_council_department_status"))
