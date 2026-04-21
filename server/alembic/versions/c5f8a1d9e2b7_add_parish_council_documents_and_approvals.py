"""add parish council documents and approvals

Revision ID: c5f8a1d9e2b7
Revises: a9e7c4d2b6f1
Create Date: 2026-04-21 01:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "c5f8a1d9e2b7"
down_revision = "a9e7c4d2b6f1"
branch_labels = None
depends_on = None


approval_status_enum = sa.Enum(
    "Pending",
    "Approved",
    "Rejected",
    name="parish_council_assignment_approval_status",
)


def upgrade() -> None:
    bind = op.get_bind()
    approval_status_enum.create(bind, checkfirst=True)

    op.add_column(
        "parish_council_assignments",
        sa.Column(
            "approval_status",
            approval_status_enum,
            nullable=False,
            server_default="Approved",
        ),
    )
    op.add_column("parish_council_assignments", sa.Column("approval_requested_at", sa.DateTime(), nullable=True))
    op.add_column("parish_council_assignments", sa.Column("approval_requested_by_id", sa.Integer(), nullable=True))
    op.add_column("parish_council_assignments", sa.Column("approval_decided_at", sa.DateTime(), nullable=True))
    op.add_column("parish_council_assignments", sa.Column("approval_decided_by_id", sa.Integer(), nullable=True))
    op.add_column("parish_council_assignments", sa.Column("approval_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_parish_council_assignments_approval_requested_by_id_users",
        "parish_council_assignments",
        "users",
        ["approval_requested_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_parish_council_assignments_approval_decided_by_id_users",
        "parish_council_assignments",
        "users",
        ["approval_decided_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_parish_council_assignments_approval_status",
        "parish_council_assignments",
        ["approval_status"],
        unique=False,
    )
    op.execute(
        sa.text(
            """
            UPDATE parish_council_assignments
            SET approval_requested_at = created_at,
                approval_decided_at = created_at
            WHERE approval_requested_at IS NULL
            """
        )
    )
    op.alter_column("parish_council_assignments", "approval_status", server_default="Pending")

    op.create_table(
        "parish_council_documents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("department_id", sa.Integer(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), nullable=True),
        sa.Column("document_type", sa.String(length=50), nullable=False, server_default="Other"),
        sa.Column("title", sa.String(length=160), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["department_id"], ["parish_council_departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assignment_id"], ["parish_council_assignments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_parish_council_documents_department_id", "parish_council_documents", ["department_id"], unique=False)
    op.create_index("ix_parish_council_documents_assignment_id", "parish_council_documents", ["assignment_id"], unique=False)
    op.create_index("ix_parish_council_documents_document_type", "parish_council_documents", ["document_type"], unique=False)
    op.create_index("ix_parish_council_documents_created_at", "parish_council_documents", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_parish_council_documents_created_at", table_name="parish_council_documents")
    op.drop_index("ix_parish_council_documents_document_type", table_name="parish_council_documents")
    op.drop_index("ix_parish_council_documents_assignment_id", table_name="parish_council_documents")
    op.drop_index("ix_parish_council_documents_department_id", table_name="parish_council_documents")
    op.drop_table("parish_council_documents")

    op.drop_index("ix_parish_council_assignments_approval_status", table_name="parish_council_assignments")
    op.drop_constraint("fk_parish_council_assignments_approval_decided_by_id_users", "parish_council_assignments", type_="foreignkey")
    op.drop_constraint("fk_parish_council_assignments_approval_requested_by_id_users", "parish_council_assignments", type_="foreignkey")
    op.drop_column("parish_council_assignments", "approval_note")
    op.drop_column("parish_council_assignments", "approval_decided_by_id")
    op.drop_column("parish_council_assignments", "approval_decided_at")
    op.drop_column("parish_council_assignments", "approval_requested_by_id")
    op.drop_column("parish_council_assignments", "approval_requested_at")
    op.drop_column("parish_council_assignments", "approval_status")

    bind = op.get_bind()
    approval_status_enum.drop(bind, checkfirst=True)
